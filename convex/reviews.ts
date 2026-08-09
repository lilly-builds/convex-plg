import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { fixtureById } from "../src/fixtures";
import { evaluateFixture } from "../src/policy";

function sanitizedEvidence(fixture: ReturnType<typeof fixtureById>) {
  const { records } = fixture;
  return [
    ...records.deployments.map((record) => ({ sourceKind: "deployment", sourceRecordId: record.id, observedAt: record.deployedAt, completeness: "complete" })),
    ...records.members.map((record) => ({ sourceKind: "member", sourceRecordId: record.id, observedAt: fixture.evaluationAt, completeness: "complete" })),
    ...records.auditEvents.map((record) => ({ sourceKind: "audit", sourceRecordId: record.id, observedAt: record.occurredAt, completeness: "complete" })),
    ...records.usageSnapshots.map((record) => ({ sourceKind: "usage_snapshot", sourceRecordId: record.id, observedAt: record.observedAt, completeness: record.seedStatus })),
    ...records.requests.map((record) => ({ sourceKind: "direct_request", sourceRecordId: record.id, observedAt: record.requestAt, completeness: record.requestState })),
  ];
}

export const seedSyntheticFixture = mutation({
  args: { fixtureId: v.string() },
  handler: async (ctx, { fixtureId }) => {
    const fixture = fixtureById(fixtureId);
    const result = evaluateFixture(fixture);
    const candidateKey = `${fixture.records.teamId}:serious_team_review:open`;
    await ctx.db.insert("evaluationAttempts", { candidateKey, policyVersion: fixture.policyVersion, fixtureId, evaluatedAt: fixture.evaluationAt, outcome: result.status, ...(result.status === "candidate" ? {} : { reason: result.reason }) });
    for (const evidence of sanitizedEvidence(fixture)) await ctx.db.insert("evidenceRecords", { candidateKey, fixtureId, externalTeamId: fixture.records.teamId, policyVersion: fixture.policyVersion, ...evidence });
    if (result.status !== "candidate") return { status: result.status, reason: result.reason, candidateId: null, targetCount: 0 };

    let candidate = await ctx.db.query("candidates").withIndex("by_candidate_key", (q) => q.eq("candidateKey", candidateKey)).unique();
    if (candidate) {
      const directUpgrade = candidate.route !== result.candidate.route && (result.candidate.route === "direct" || result.candidate.route === "both");
      if (directUpgrade) {
        await ctx.db.patch(candidate._id, { route: result.candidate.route, recommendation: result.candidate.recommendation, ...(result.candidate.ownerId ? { ownerId: result.candidate.ownerId } : {}), recipientPolicyId: result.candidate.recipientPolicyId, recipientPolicyVersion: result.candidate.recipientPolicyVersion, deliveryState: result.candidate.deliveryState, policyVersion: fixture.policyVersion, updatedAt: fixture.evaluationAt });
        const currentTargets = await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id)).collect();
        const requiredKeys = new Set(result.targets.map((target) => target.id));
        for (const target of currentTargets) if (!requiredKeys.has(target.idempotencyKey) && target.status !== "succeeded") await ctx.db.patch(target._id, { status: "superseded" });
        for (const target of result.targets) {
          const existingTarget = await ctx.db.query("deliveryTargets").withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", target.id)).unique();
          if (!existingTarget) await ctx.db.insert("deliveryTargets", { candidateId: candidate._id, idempotencyKey: target.id, recipientId: target.recipientId, channel: target.channel, urgent: target.urgent, status: "pending" });
        }
      } else {
        await ctx.db.patch(candidate._id, { policyVersion: fixture.policyVersion, updatedAt: fixture.evaluationAt });
      }
      return { status: "existing", candidateId: candidate._id, targetCount: (await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id)).collect()).length };
    }
    const team = await ctx.db.query("teams").withIndex("by_external_team", (q) => q.eq("externalTeamId", result.candidate.teamId)).unique();
    if (!team) await ctx.db.insert("teams", { externalTeamId: result.candidate.teamId, displayName: result.candidate.teamDisplayName });
    const candidateId = await ctx.db.insert("candidates", { candidateKey, externalTeamId: result.candidate.teamId, route: result.candidate.route, recommendation: result.candidate.recommendation, ...(result.candidate.ownerId ? { ownerId: result.candidate.ownerId } : {}), policyVersion: result.candidate.policyVersion, recipientPolicyId: result.candidate.recipientPolicyId, recipientPolicyVersion: result.candidate.recipientPolicyVersion, deliveryState: result.candidate.deliveryState, createdAt: fixture.evaluationAt, updatedAt: fixture.evaluationAt });
    for (const target of result.targets) await ctx.db.insert("deliveryTargets", { candidateId, idempotencyKey: target.id, recipientId: target.recipientId, channel: target.channel, urgent: target.urgent, status: "pending" });
    return { status: "created", candidateId, targetCount: result.targets.length };
  },
});

export const listCandidates = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("candidates").collect(),
});

export const recordTestOnlyAttempt = internalMutation({
  args: { targetId: v.id("deliveryTargets"), outcome: v.union(v.literal("failed"), v.literal("succeeded")), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.targetId);
    if (!target) throw new Error("Unknown delivery target");
    if (target.status === "succeeded") return { recorded: false, reason: "already_succeeded" };
    await ctx.db.insert("deliveryAttempts", { targetId: args.targetId, outcome: args.outcome, occurredAt: new Date().toISOString(), ...(args.error ? { error: args.error } : {}) });
    await ctx.db.patch(args.targetId, { status: args.outcome === "succeeded" ? "succeeded" : "failed" });
    return { recorded: true, reason: null };
  },
});

export const listDeliveryTargets = query({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, args) => await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId)).collect(),
});

export const queueTestOnlyDelivery = mutation({
  args: { targetId: v.id("deliveryTargets"), simulate: v.union(v.literal("outage"), v.literal("success")) },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.testDelivery.deliver, args);
    return null;
  },
});

export const getDeliveryState = query({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, args) => {
    const targets = await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId)).collect();
    return await Promise.all(targets.map(async (target) => ({ ...target, attempts: await ctx.db.query("deliveryAttempts").withIndex("by_target", (q) => q.eq("targetId", target._id)).collect() })));
  },
});

export const getCandidateDetails = query({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) return null;
    const evidence = await ctx.db.query("evidenceRecords").withIndex("by_candidate_key", (q) => q.eq("candidateKey", candidate.candidateKey)).collect();
    const targets = await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId)).collect();
    return { candidate, evidence, targets };
  },
});

export const getEvaluationState = query({
  args: { externalTeamId: v.string() },
  handler: async (ctx, args) => {
    const candidateKey = `${args.externalTeamId}:serious_team_review:open`;
    const evaluations = await ctx.db.query("evaluationAttempts").withIndex("by_candidate_key", (q) => q.eq("candidateKey", candidateKey)).collect();
    const candidate = await ctx.db.query("candidates").withIndex("by_candidate_key", (q) => q.eq("candidateKey", candidateKey)).unique();
    const targets = candidate ? await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id)).collect() : [];
    return { evaluationCount: evaluations.length, candidateCount: candidate ? 1 : 0, deliveryTargetCount: targets.length };
  },
});
