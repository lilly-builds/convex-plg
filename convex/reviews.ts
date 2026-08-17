import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { fixtureById } from "../src/fixtures";
import { evaluateFixture } from "../src/policy";
import type { Id } from "./_generated/dataModel";

const POLICY_ID = "team_review";
const DEMO_SCOPE = "default";
const DEMO_LABEL = `demo:${DEMO_SCOPE}`;
const DEMO_TEAM_PREFIX = "demo:default:";
function requireSyntheticSandbox() { if (process.env.SYNTHETIC_SANDBOX !== "enabled") throw new Error("Synthetic sandbox is disabled"); }
function requireDemoScope(scope: string) { if (scope !== DEMO_SCOPE) throw new Error(`Unsupported demo reset scope: ${scope}`); }
function evidence(fixture: ReturnType<typeof fixtureById>, externalTeamId: string, demoLabel?: string) {
  const { records } = fixture; const common = { externalTeamId, fixtureId: fixture.id, ingestedAt: fixture.evaluationAt, identityConfidence: records.identityConfidence, policyVersion: fixture.policyVersion, ...(demoLabel ? { demoLabel } : {}) };
  return [
    ...records.deployments.map((r) => ({ ...common, sourceKind: "deployment", sourceName: "synthetic_deployment", sourceRecordId: r.id, observedAt: r.deployedAt, completeness: "complete", sourceAuthorized: r.sourceAuthorized, summary: `${r.deploymentType}:${r.current}` })),
    ...records.members.map((r) => ({ ...common, sourceKind: "member", sourceName: "synthetic_membership", sourceRecordId: r.id, observedAt: fixture.evaluationAt, completeness: "complete", sourceAuthorized: r.sourceAuthorized, summary: "member" })),
    ...records.auditEvents.map((r) => ({ ...common, sourceKind: "audit", sourceName: "synthetic_audit", sourceRecordId: r.id, observedAt: r.occurredAt, completeness: "complete", sourceAuthorized: r.sourceAuthorized, summary: r.action })),
    ...records.usageSnapshots.map((r) => ({ ...common, sourceKind: "usage_snapshot", sourceName: "synthetic_usage", sourceRecordId: r.id, observedAt: r.observedAt, completeness: r.seedStatus, sourceAuthorized: r.sourceAuthorized, summary: `${r.meterId}:${r.measuredUsage}/${r.approvedApplicableLimit ?? "none"}:${r.pressureState}` })),
    ...records.requests.map((r) => ({ ...common, sourceKind: "direct_request", sourceName: "synthetic_request", sourceRecordId: r.id, observedAt: r.requestAt, completeness: r.requestState, sourceAuthorized: r.sourceAuthorized, summary: `${r.requestType}:${r.inboundOrAuthorized}` })),
  ];
}
async function stopPendingDeliveries(ctx: MutationCtx, candidateId: Id<"candidates">) { const targets = await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", candidateId)).collect(); for (const target of targets) if (target.status === "pending" || target.status === "failed") await ctx.db.patch(target._id, { status: "stopped" }); }

export const seedSyntheticFixture = mutation({ args: { fixtureId: v.string(), testRunId: v.optional(v.string()) }, handler: async (ctx, { fixtureId, testRunId }) => {
  requireSyntheticSandbox(); if (testRunId && !/^[a-zA-Z0-9_-]{1,80}$/.test(testRunId)) throw new Error("Invalid synthetic test run ID"); const fixture = fixtureById(fixtureId); const result = evaluateFixture(fixture); const demoLabel = testRunId ? undefined : DEMO_LABEL; const externalTeamId = testRunId ? fixture.records.teamId : `${DEMO_TEAM_PREFIX}${fixture.records.teamId}`; const candidateKey = `${testRunId ? `test:${testRunId}:` : `${DEMO_LABEL}:`}${fixture.records.teamId}:${POLICY_ID}:open`;
  await ctx.db.insert("evaluationAttempts", { candidateKey, policyVersion: fixture.policyVersion, fixtureId, evaluatedAt: fixture.evaluationAt, outcome: result.status, ...(result.status === "candidate" ? {} : { reason: result.reason }), ...(demoLabel ? { demoLabel } : {}) });
  for (const row of evidence(fixture, externalTeamId, demoLabel)) await ctx.db.insert("evidenceRecords", { candidateKey, ...row });
  if (result.status !== "candidate") return { status: result.status, reason: result.reason, candidateId: null, targetCount: 0 };
  let candidate = await ctx.db.query("candidates").withIndex("by_candidate_key", (q) => q.eq("candidateKey", candidateKey)).unique();
  if (candidate) {
    const seriousUpgrade = candidate.route !== result.candidate.route && result.candidate.route !== "emerging";
    if (seriousUpgrade && (candidate.status ?? "open") === "open") { await ctx.db.patch(candidate._id, { route: result.candidate.route, recommendation: result.candidate.recommendation, ...(result.candidate.ownerId ? { ownerId: result.candidate.ownerId } : {}), recipientPolicyId: result.candidate.recipientPolicyId, recipientPolicyVersion: result.candidate.recipientPolicyVersion, deliveryState: result.candidate.deliveryState, policyVersion: fixture.policyVersion, updatedAt: fixture.evaluationAt }); await ctx.db.insert("candidateEvents", { candidateId: candidate._id, eventType: "route_upgraded", occurredAt: fixture.evaluationAt, details: `${candidate.route}->${result.candidate.route};owner=${result.candidate.ownerId ?? "none"}`, ...(candidate.demoLabel ? { demoLabel: candidate.demoLabel } : {}) }); const oldTargets=await ctx.db.query("deliveryTargets").withIndex("by_candidate",q=>q.eq("candidateId",candidate._id)).collect(); const targetKey=(targetId:string)=>`${candidateKey}:${targetId}`; const required=new Set(result.targets.map(target=>target.id)); for(const target of oldTargets)if(!required.has(target.idempotencyKey)&&!required.has(target.idempotencyKey.replace(`${candidateKey}:`,""))&&target.status!=="succeeded")await ctx.db.patch(target._id,{status:"superseded"}); for(const target of result.targets){const existingTarget=oldTargets.find(existing=>existing.idempotencyKey===target.id||existing.idempotencyKey===targetKey(target.id));if(!existingTarget)await ctx.db.insert("deliveryTargets",{candidateId:candidate._id,idempotencyKey:targetKey(target.id),recipientId:target.recipientId,channel:target.channel,urgent:target.urgent,status:"pending",...(candidate.demoLabel ? { demoLabel: candidate.demoLabel } : {})});else if(existingTarget.status!=="succeeded")await ctx.db.patch(existingTarget._id,{urgent:target.urgent});} }
    else await ctx.db.patch(candidate._id, { policyVersion: fixture.policyVersion, updatedAt: fixture.evaluationAt });
    const targets = await ctx.db.query("deliveryTargets").withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id)).collect(); return { status: "existing", candidateId: candidate._id, targetCount: targets.length };
  }
  const team = await ctx.db.query("teams").withIndex("by_external_team", (q) => q.eq("externalTeamId", externalTeamId)).unique(); if (!team) await ctx.db.insert("teams", { externalTeamId, displayName: result.candidate.teamDisplayName, ...(demoLabel ? { demoLabel } : {}) });
  const candidateId = await ctx.db.insert("candidates", { candidateKey, externalTeamId, route: result.candidate.route, recommendation: result.candidate.recommendation, ...(result.candidate.ownerId ? { ownerId: result.candidate.ownerId } : {}), policyVersion: result.candidate.policyVersion, recipientPolicyId: result.candidate.recipientPolicyId, recipientPolicyVersion: result.candidate.recipientPolicyVersion, deliveryState: result.candidate.deliveryState, status: "open", createdAt: fixture.evaluationAt, updatedAt: fixture.evaluationAt, ...(demoLabel ? { demoLabel } : {}) });
  await ctx.db.insert("candidateEvents", { candidateId, eventType: "created", occurredAt: fixture.evaluationAt, details: `route=${result.candidate.route};owner=${result.candidate.ownerId ?? "none"}`, ...(demoLabel ? { demoLabel } : {}) });
  for (const target of result.targets) await ctx.db.insert("deliveryTargets", { candidateId, idempotencyKey: `${candidateKey}:${target.id}`, recipientId: target.recipientId, channel: target.channel, urgent: target.urgent, status: "pending", ...(demoLabel ? { demoLabel } : {}) });
  return { status: "created", candidateId, targetCount: result.targets.length };
} });

export const recordDecision = mutation({ args: { candidateId: v.id("candidates"), actorId: v.string(), decision: v.union(v.literal("observe"), v.literal("send_helpful_resource"), v.literal("assign_technical_response"), v.literal("review_commercial_play"), v.literal("not_now"), v.literal("wrong_reason"), v.literal("already_owned"), v.literal("suppress")), reason: v.string() }, handler: async (ctx, args) => {
  requireSyntheticSandbox(); const candidate = await ctx.db.get(args.candidateId); if (!candidate) throw new Error("Unknown candidate"); if ((candidate.status ?? "open") !== "open") return { recorded: false, status: candidate.status ?? "open" };
  const terminal = new Set(["not_now", "wrong_reason", "already_owned", "suppress"]); const status = terminal.has(args.decision) ? "closed" : "open";
  await ctx.db.patch(candidate._id, { status, updatedAt: new Date().toISOString() }); await ctx.db.insert("candidateEvents", { candidateId: candidate._id, eventType: `decision:${args.decision}`, actorId: args.actorId, occurredAt: new Date().toISOString(), details: args.reason, ...(candidate.demoLabel ? { demoLabel: candidate.demoLabel } : {}) });
  if (terminal.has(args.decision)) { await stopPendingDeliveries(ctx, candidate._id); const state = args.decision === "not_now" ? "cooldown" : args.decision; const prior = await ctx.db.query("teamPolicyStates").withIndex("by_team_policy", (q) => q.eq("externalTeamId", candidate.externalTeamId).eq("policyId", POLICY_ID)).unique(); const value = { state, updatedAt: new Date().toISOString(), ...(args.decision === "not_now" ? { expiresAt: new Date(Date.now() + 30*24*60*60*1000).toISOString() } : {}) }; if (prior) await ctx.db.patch(prior._id, value); else await ctx.db.insert("teamPolicyStates", { externalTeamId: candidate.externalTeamId, policyId: POLICY_ID, ...value, ...(candidate.demoLabel ? { demoLabel: candidate.demoLabel } : {}) }); }
  return { recorded: true, status };
} });

export const listCandidates = query({ args: {}, handler: async (ctx) => { requireSyntheticSandbox(); const rows = await ctx.db.query("candidates").withIndex("by_demo_label", (q) => q.eq("demoLabel", DEMO_LABEL)).collect(); return await Promise.all(rows.map(async (candidate) => ({ ...candidate, teamDisplayName: (await ctx.db.query("teams").withIndex("by_external_team", (q) => q.eq("externalTeamId", candidate.externalTeamId)).unique())?.displayName ?? "unresolved" }))); } });
export const getCandidateDetails = query({ args: { candidateId: v.id("candidates") }, handler: async (ctx,args) => { requireSyntheticSandbox(); const candidate=await ctx.db.get(args.candidateId); if(!candidate)return null; const team=await ctx.db.query("teams").withIndex("by_external_team",q=>q.eq("externalTeamId",candidate.externalTeamId)).unique(); const evidenceRows=await ctx.db.query("evidenceRecords").withIndex("by_candidate_key",q=>q.eq("candidateKey",candidate.candidateKey)).collect(); const targets=await ctx.db.query("deliveryTargets").withIndex("by_candidate",q=>q.eq("candidateId",candidate._id)).collect(); const events=await ctx.db.query("candidateEvents").withIndex("by_candidate",q=>q.eq("candidateId",candidate._id)).collect(); return {candidate,teamDisplayName:team?.displayName??"unresolved",evidence:evidenceRows,targets,events}; } });
export const listDeliveryTargets = query({ args:{candidateId:v.id("candidates")}, handler:async(ctx,args)=>{requireSyntheticSandbox();return await ctx.db.query("deliveryTargets").withIndex("by_candidate",q=>q.eq("candidateId",args.candidateId)).collect();} });
export const getDeliveryState=query({args:{candidateId:v.id("candidates")},handler:async(ctx,args)=>{requireSyntheticSandbox();const targets=await ctx.db.query("deliveryTargets").withIndex("by_candidate",q=>q.eq("candidateId",args.candidateId)).collect();return await Promise.all(targets.map(async target=>({...target,attempts:await ctx.db.query("deliveryAttempts").withIndex("by_target",q=>q.eq("targetId",target._id)).collect()})));}});
export const queueTestOnlyDelivery=mutation({args:{targetId:v.id("deliveryTargets"),simulate:v.union(v.literal("outage"),v.literal("success"))},handler:async(ctx,args)=>{requireSyntheticSandbox();const target=await ctx.db.get(args.targetId);if(!target||target.status!=="pending")return {queued:false};const candidate=await ctx.db.get(target.candidateId);if(!candidate||candidate.status!=="open")return {queued:false};await ctx.scheduler.runAfter(0,internal.testDelivery.deliver,args);return {queued:true};}});
export const recordTestOnlyAttempt=internalMutation({args:{targetId:v.id("deliveryTargets"),outcome:v.union(v.literal("failed"),v.literal("succeeded")),error:v.optional(v.string())},handler:async(ctx,args)=>{const target=await ctx.db.get(args.targetId);if(!target)return{recorded:false,reason:"missing"};const candidate=await ctx.db.get(target.candidateId);if(!candidate||candidate.status!=="open")return{recorded:false,reason:"candidate_closed"};if(target.status!=="pending"&&target.status!=="failed")return{recorded:false,reason:"inactive"};await ctx.db.insert("deliveryAttempts",{targetId:args.targetId,outcome:args.outcome,occurredAt:new Date().toISOString(),...(args.error?{error:args.error}:{}),...(target.demoLabel?{demoLabel:target.demoLabel}:{})});await ctx.db.patch(target._id,{status:args.outcome==="succeeded"?"succeeded":"failed"});return{recorded:true,reason:null};}});

export const resetDemo = mutation({ args: { scope: v.string() }, handler: async (ctx, { scope }) => {
  requireSyntheticSandbox(); requireDemoScope(scope);
  const tables = ["deliveryAttempts", "deliveryTargets", "candidateEvents", "evidenceRecords", "evaluationAttempts", "candidates", "teamPolicyStates", "teams"] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await ctx.db.query(table).withIndex("by_demo_label", (q) => q.eq("demoLabel", DEMO_LABEL)).collect();
    counts[table] = rows.length;
    for (const row of rows) await ctx.db.delete(row._id);
  }
  return { scope, baseline: "empty", counts };
} });

export const getDemoResetState = query({ args: { scope: v.string() }, handler: async (ctx, { scope }) => {
  requireSyntheticSandbox(); requireDemoScope(scope);
  const tables = ["deliveryAttempts", "deliveryTargets", "candidateEvents", "evidenceRecords", "evaluationAttempts", "candidates", "teamPolicyStates", "teams"] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) counts[table] = (await ctx.db.query(table).withIndex("by_demo_label", (q) => q.eq("demoLabel", DEMO_LABEL)).collect()).length;
  return { scope, baseline: "empty", counts };
} });
export const getEvaluationState=query({args:{externalTeamId:v.string(),testRunId:v.optional(v.string())},handler:async(ctx,args)=>{requireSyntheticSandbox();const key=`${args.testRunId ? `test:${args.testRunId}:` : ""}${args.externalTeamId}:${POLICY_ID}:open`;const evaluations=await ctx.db.query("evaluationAttempts").withIndex("by_candidate_key",q=>q.eq("candidateKey",key)).collect();const candidate=await ctx.db.query("candidates").withIndex("by_candidate_key",q=>q.eq("candidateKey",key)).unique();const targets=candidate?await ctx.db.query("deliveryTargets").withIndex("by_candidate",q=>q.eq("candidateId",candidate._id)).collect():[];return{evaluationCount:evaluations.length,candidateCount:candidate?1:0,deliveryTargetCount:targets.length};}});
