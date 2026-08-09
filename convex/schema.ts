import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({ externalTeamId: v.string(), displayName: v.string() }).index("by_external_team", ["externalTeamId"]),
  candidates: defineTable({ candidateKey: v.string(), externalTeamId: v.string(), route: v.string(), recommendation: v.string(), ownerId: v.optional(v.string()), policyVersion: v.string(), recipientPolicyId: v.string(), recipientPolicyVersion: v.string(), deliveryState: v.string(), status: v.optional(v.string()), createdAt: v.string(), updatedAt: v.string() }).index("by_candidate_key", ["candidateKey"]),
  evaluationAttempts: defineTable({ candidateKey: v.string(), policyVersion: v.string(), fixtureId: v.string(), evaluatedAt: v.string(), outcome: v.string(), reason: v.optional(v.string()) }).index("by_candidate_key", ["candidateKey"]),
  evidenceRecords: defineTable({ candidateKey: v.string(), fixtureId: v.string(), sourceKind: v.string(), sourceRecordId: v.string(), sourceName: v.optional(v.string()), externalTeamId: v.string(), observedAt: v.string(), ingestedAt: v.optional(v.string()), completeness: v.string(), identityConfidence: v.optional(v.string()), sourceAuthorized: v.optional(v.boolean()), policyVersion: v.string(), summary: v.optional(v.string()) }).index("by_candidate_key", ["candidateKey"]),
  candidateEvents: defineTable({ candidateId: v.id("candidates"), eventType: v.string(), occurredAt: v.string(), actorId: v.optional(v.string()), details: v.string() }).index("by_candidate", ["candidateId"]),
  teamPolicyStates: defineTable({ externalTeamId: v.string(), policyId: v.string(), state: v.string(), expiresAt: v.optional(v.string()), updatedAt: v.string() }).index("by_team_policy", ["externalTeamId", "policyId"]),
  deliveryTargets: defineTable({ candidateId: v.id("candidates"), idempotencyKey: v.string(), recipientId: v.string(), channel: v.string(), urgent: v.boolean(), status: v.string() }).index("by_idempotency_key", ["idempotencyKey"]).index("by_candidate", ["candidateId"]),
  deliveryAttempts: defineTable({ targetId: v.id("deliveryTargets"), outcome: v.string(), occurredAt: v.string(), error: v.optional(v.string()) }).index("by_target", ["targetId"]),
});
