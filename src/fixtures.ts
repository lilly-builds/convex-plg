import { EVALUATION_AT, POLICY_VERSION, type Fixture, type RecipientPolicy, type SourceRecords, type UsageSnapshot } from "./model.js";

const freeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); }
  return value as Readonly<T>;
};
const pressurePolicy: RecipientPolicy = { id: "RP-pressure-v1", version: "1", route: "pressure", recipients: [
  { id: "user:marketing-owner", role: "owner", channel: "slack" }, { id: "user:product-marketer", role: "collaborator", channel: "email" },
] };
const directPolicy: RecipientPolicy = { id: "RP-direct-v1", version: "1", route: "direct", recipients: [
  { id: "user:dx-owner", role: "owner", channel: "email" }, { id: "user:marketing-owner", role: "collaborator", channel: "slack" },
] };
const emergingPolicy: RecipientPolicy = { id: "RP-emerging-v1", version: "1", route: "emerging", recipients: [{ id: "user:product-marketer", role: "owner", channel: "email" }, { id: "user:marketing-owner", role: "collaborator", channel: "slack" }] };
const noSuppression = { noContact: false, partner: "none" as const, existingOwner: false, openCase: false, cooldown: false };
function snapshots(prefix: string, teamId: string, states: readonly UsageSnapshot["seedStatus"][] = ["complete", "complete", "complete"], measured = [82000, 86000, 91000]): readonly UsageSnapshot[] {
  return ["03", "04", "05"].map((day, index) => ({ id: `U-${prefix}-08${day}`, teamId, usageDate: `2026-08-${day}`, observedAt: `2026-08-${String(Number(day) + 1).padStart(2, "0")}T12:00:00Z`, seedStatus: states[index]!, teamAttributionState: "confirmed", meterId: "function_calls", unit: "calls", measurementWindow: "daily_utc", limitType: "hard", limitScope: "team", measuredUsage: measured[index]!, approvedApplicableLimit: 100000, pressureState: "confirmed", sourceAuthorized: true }));
}
function p1Records(teamId = "T-serious"): SourceRecords {
  return { teamId, teamDisplayName: "Serious Team", identityConfidence: "confirmed", deployments: [
    { id: "D-P1-prod", teamId, deploymentType: "production", current: true, creatorMemberId: "M-P1-1", deployedAt: "2026-08-03T09:00:00Z", sourceAuthorized: true },
    { id: "D-P1-c2", teamId, deploymentType: "production", current: false, creatorMemberId: "M-P1-2", deployedAt: "2026-08-06T09:00:00Z", sourceAuthorized: true },
  ], members: [1,2,3].map((n) => ({ id: `M-P1-${n}`, teamId, displayName: `P1 Member ${n}`, sourceAuthorized: true })), auditEvents: [], usageSnapshots: snapshots("P1", teamId), requests: [], suppression: noSuppression };
}
function p2Records(): SourceRecords {
  const teamId = "T-request";
  return { teamId, teamDisplayName: "Request Team", identityConfidence: "confirmed", deployments: [{ id: "D-P2-prod", teamId, deploymentType: "production", current: true, creatorMemberId: "M-P2-1", deployedAt: "2026-08-03T09:00:00Z", sourceAuthorized: true }], members: [1,2].map((n) => ({ id: `M-P2-${n}`, teamId, displayName: `P2 Member ${n}`, sourceAuthorized: true })), auditEvents: [{ id: "A-P2-join", teamId, action: "team:join", occurredAt: "2026-07-30T09:00:00Z", sourceAuthorized: true }], usageSnapshots: snapshots("P2", teamId, ["complete", "complete", "complete"], [1000, 2000, 3000]).map((s) => ({ ...s, pressureState: "not_confirmed" as const })), requests: [{ id: "R-P2-sso", teamId, requestType: "sso", requestState: "open", requestAt: "2026-08-07T09:00:00Z", inboundOrAuthorized: true, sourceAuthorized: true }], suppression: noSuppression };
}
const withExpected = (id: string, records: SourceRecords, expected: Fixture["expected"], recipientPolicies: readonly RecipientPolicy[] = [pressurePolicy, directPolicy], policyVersion = POLICY_VERSION, policyKind: Fixture["policyKind"] = "serious"): Fixture => freeze({ id, evaluationAt: EVALUATION_AT, policyVersion, policyKind, records, recipientPolicies, expected });

export const fixtures: readonly Fixture[] = freeze([
  withExpected("P1", p1Records(), { status: "candidate", candidateId: "C-T-serious-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-serious-team_review-owner-slack", "DT-C-T-serious-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }),
  withExpected("P2", p2Records(), { status: "candidate", candidateId: "C-T-request-team_review", route: "direct", recommendation: "Assign technical response", ownerId: "user:dx-owner", deliveryTargetIds: ["DT-C-T-request-team_review-dx-email", "DT-C-T-request-team_review-marketing-slack"], attemptCount: 0, deliveryState: "ready" }),
  withExpected("P3", { ...p1Records(), requests: [{ id: "R-P1-procurement", teamId: "T-serious", requestType: "procurement", requestState: "open", requestAt: "2026-08-08T09:00:00Z", inboundOrAuthorized: true, sourceAuthorized: true }] }, { status: "candidate", candidateId: "C-T-serious-team_review", route: "both", recommendation: "Assign technical response", ownerId: "user:dx-owner", deliveryTargetIds: ["DT-C-T-serious-team_review-dx-email", "DT-C-T-serious-team_review-marketing-slack"], attemptCount: 0, deliveryState: "ready" }),
  withExpected("F1", { ...p1Records("T-solo"), teamDisplayName: "Solo Prototype", members: [{ id: "M-F1-1", teamId: "T-solo", displayName: "Solo", sourceAuthorized: true }], deployments: [{ id: "D-F1-dev", teamId: "T-solo", deploymentType: "development", current: true, creatorMemberId: "M-F1-1", deployedAt: "2026-08-03T09:00:00Z", sourceAuthorized: true }] }, { status: "hold", reason: "production_and_shared_adoption_failed", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F2", { ...p1Records("T-launch"), teamDisplayName: "Launch Prep", usageSnapshots: snapshots("F2", "T-launch").slice(0, 2) }, { status: "hold", reason: "sustained_use_failed", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F3", { ...p1Records("T-healthy"), teamDisplayName: "Healthy Team", usageSnapshots: snapshots("F3", "T-healthy", ["complete", "complete", "complete"], [1000, 2000, 3000]).map((s) => ({ ...s, pressureState: "not_confirmed" as const })) }, { status: "hold", reason: "commercial_moment_failed", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F4", { ...p1Records("T-partial"), teamDisplayName: "Partial Team", usageSnapshots: snapshots("F4", "T-partial", ["complete", "complete", "partial"]) }, { status: "hold", reason: "sustained_use_failed", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F5", { ...p1Records("T-unconfirmed"), teamDisplayName: "Unconfirmed Team", usageSnapshots: snapshots("F5", "T-unconfirmed").map((s, i) => i === 2 ? (() => { const { approvedApplicableLimit: _limit, ...withoutLimit } = s; return { ...withoutLimit, pressureState: "unknown" as const }; })() : s) }, { status: "hold", reason: "commercial_moment_failed", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F6", { ...p2Records(), teamId: "T-bad-request", teamDisplayName: "Bad Request Team", deployments: p2Records().deployments.map((d) => ({ ...d, teamId: "T-bad-request" })), members: p2Records().members.map((m) => ({ ...m, teamId: "T-bad-request" })), auditEvents: p2Records().auditEvents.map((a) => ({ ...a, teamId: "T-bad-request" })), usageSnapshots: p2Records().usageSnapshots.map((s) => ({ ...s, teamId: "T-bad-request" })), requests: [{ ...p2Records().requests[0]!, teamId: "T-bad-request", requestState: "closed" }] }, { status: "hold", reason: "commercial_moment_failed", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F7", { ...p1Records("T-suppressed"), teamDisplayName: "Suppressed Team", suppression: { ...noSuppression, noContact: true } }, { status: "suppressed", reason: "no_contact", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F8", p1Records(), { status: "candidate", candidateId: "C-T-serious-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-serious-team_review-owner-slack", "DT-C-T-serious-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }),
  withExpected("F9", p1Records("T-routing-gap"), { status: "candidate", candidateId: "C-T-routing-gap-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: [], attemptCount: 0, deliveryState: "delivery_blocked" }, [{ ...pressurePolicy, recipients: [{ id: "user:marketing-owner", role: "owner" }] }]),
  withExpected("F10", p1Records(), { status: "candidate", candidateId: "C-T-serious-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-serious-team_review-owner-slack", "DT-C-T-serious-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }, [pressurePolicy, directPolicy], "0.3"),
  withExpected("F11", { ...p1Records("T-boundary"), teamDisplayName: "Boundary Team", usageSnapshots: snapshots("F11", "T-boundary").map((s, i) => i === 1 ? { ...s, sourceAuthorized: false } : s) }, { status: "hold", reason: "source_unauthorized", deliveryTargetIds: [], attemptCount: 0 }),
  withExpected("F12", p1Records("T-config"), { status: "candidate", candidateId: "C-T-config-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-config-team_review-owner-slack", "DT-C-T-config-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }),
  withExpected("E1", { ...p1Records("T-emerging"), teamDisplayName: "Emerging Team", usageSnapshots: snapshots("E1", "T-emerging", ["complete", "complete", "complete"], [1000, 2000, 3000]).map((snapshot) => ({ ...snapshot, pressureState: "not_confirmed" as const })) }, { status: "candidate", candidateId: "C-T-emerging-team_review", route: "emerging", recommendation: "Observe", ownerId: "user:product-marketer", deliveryTargetIds: ["DT-C-T-emerging-team_review-owner-email", "DT-C-T-emerging-team_review-marketing-slack"], attemptCount: 0, deliveryState: "ready" }, [emergingPolicy, pressurePolicy, directPolicy], POLICY_VERSION, "emerging"),
  withExpected("E2", { ...p1Records("T-emerging-short"), teamDisplayName: "Emerging Short", usageSnapshots: snapshots("E2", "T-emerging-short").slice(0,2) }, { status: "hold", reason: "sustained_use_failed", deliveryTargetIds: [], attemptCount: 0 }, [emergingPolicy, pressurePolicy, directPolicy], POLICY_VERSION, "emerging"),
  withExpected("E3", { ...p1Records("T-emerging-pressure"), teamDisplayName: "Emerging Pressure" }, { status: "candidate", candidateId: "C-T-emerging-pressure-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-emerging-pressure-team_review-owner-slack", "DT-C-T-emerging-pressure-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }, [emergingPolicy, pressurePolicy, directPolicy], POLICY_VERSION, "emerging"),
  withExpected("E4", { ...p2Records(), teamId: "T-emerging-direct", teamDisplayName: "Emerging Direct", deployments: p2Records().deployments.map((record) => ({...record,teamId:"T-emerging-direct"})), members:p2Records().members.map((record)=>({...record,teamId:"T-emerging-direct"})), auditEvents:p2Records().auditEvents.map((record)=>({...record,teamId:"T-emerging-direct"})), usageSnapshots:p2Records().usageSnapshots.map((record)=>({...record,teamId:"T-emerging-direct"})), requests:p2Records().requests.map((record)=>({...record,teamId:"T-emerging-direct"})) }, { status: "candidate", candidateId: "C-T-emerging-direct-team_review", route: "direct", recommendation: "Assign technical response", ownerId: "user:dx-owner", deliveryTargetIds: ["DT-C-T-emerging-direct-team_review-dx-email", "DT-C-T-emerging-direct-team_review-marketing-slack"], attemptCount: 0, deliveryState: "ready" }, [emergingPolicy, pressurePolicy, directPolicy], POLICY_VERSION, "emerging"),
  withExpected("E5", { ...p1Records("T-emerging"), teamDisplayName: "Emerging Team" }, { status: "candidate", candidateId: "C-T-emerging-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-emerging-team_review-owner-slack", "DT-C-T-emerging-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }, [emergingPolicy, pressurePolicy, directPolicy], POLICY_VERSION, "emerging"),
  withExpected("E7", { ...p1Records("T-emerging-suppressed"), teamDisplayName: "Emerging Suppressed", usageSnapshots: snapshots("E7", "T-emerging-suppressed", ["complete","complete","complete"], [1000,2000,3000]).map((snapshot)=>({...snapshot,pressureState:"not_confirmed" as const})), suppression: {...noSuppression,noContact:true} }, { status:"suppressed",reason:"no_contact",deliveryTargetIds:[],attemptCount:0 }, [emergingPolicy,pressurePolicy,directPolicy], POLICY_VERSION,"emerging"),
]);

export const fixtureById = (id: string): Fixture => {
  const fixture = [...fixtures, ...testControls].find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown synthetic fixture: ${id}`);
  return fixture;
};

const renamedP1 = (teamId: string, teamDisplayName: string): SourceRecords => {
  const original = p1Records();
  return {
    ...original, teamId, teamDisplayName,
    deployments: original.deployments.map((record) => ({ ...record, teamId })),
    members: original.members.map((record) => ({ ...record, teamId })),
    auditEvents: original.auditEvents.map((record) => ({ ...record, teamId })),
    usageSnapshots: original.usageSnapshots.map((record) => ({ ...record, teamId })),
    requests: original.requests.map((record) => ({ ...record, teamId })),
  };
};
/** Extra controls are not policy fixtures; they exist solely for duplicate and load verification. */
export const testControls: readonly Fixture[] = freeze([
  withExpected("TEST-race", renamedP1("T-race", "Race Team"), { status: "candidate", candidateId: "C-T-race-team_review", route: "pressure", recommendation: "Review commercial play", ownerId: "user:marketing-owner", deliveryTargetIds: ["DT-C-T-race-team_review-owner-slack", "DT-C-T-race-team_review-collaborator-email"], attemptCount: 0, deliveryState: "ready" }),
]);
