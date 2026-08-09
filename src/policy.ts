import { EVALUATION_AT, POLICY_ID, type Candidate, type DeliveryTarget, type Evaluation, type Fixture, type HoldReason, type RecipientPolicy, type Route, type SourceRecords, type SuppressionReason, type UsageSnapshot } from "./model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const time = (value: string) => Date.parse(value);
const dayEnd = (date: string) => time(`${date}T23:59:59.999Z`);
const daysBetween = (at: string, days: number) => time(at) - days * DAY_MS;
const lastSevenCompletedDays = (at: string) => {
  const end = new Date(time(at)); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() - 1);
  return new Set(Array.from({ length: 7 }, (_, index) => {
    const day = new Date(end); day.setUTCDate(end.getUTCDate() - index); return day.toISOString().slice(0, 10);
  }));
};

function allRecords(records: SourceRecords) {
  return [...records.deployments, ...records.members, ...records.auditEvents, ...records.usageSnapshots, ...records.requests];
}
function sourceIsAuthorized(records: SourceRecords): boolean {
  return allRecords(records).every((record) => record.sourceAuthorized) && !records.usageSnapshots.some((record) => record.unavailableByDesign);
}
function allRecordsMapToTeam(records: SourceRecords): boolean {
  return allRecords(records).every((record) => record.teamId === records.teamId);
}
function suppressionReason(s: SourceRecords["suppression"]): SuppressionReason | null {
  if (s.noContact) return "no_contact";
  if (s.partner !== "none") return "partner_attribution";
  if (s.existingOwner || s.openCase) return "existing_owner_or_open_case";
  if (s.cooldown) return "cooldown";
  return null;
}
function validSnapshots(records: SourceRecords, at: string): readonly UsageSnapshot[] {
  const allowable = lastSevenCompletedDays(at);
  return records.usageSnapshots.filter((snapshot) => allowable.has(snapshot.usageDate)
    && snapshot.seedStatus === "complete" && snapshot.teamAttributionState === "confirmed"
    && time(snapshot.observedAt) <= dayEnd(snapshot.usageDate) + 36 * 60 * 60 * 1000);
}
function commonGateFailure(records: SourceRecords, at: string): HoldReason | null {
  if (!records.teamId || !records.teamDisplayName || records.identityConfidence !== "confirmed" || !allRecordsMapToTeam(records)) return "identity_failed";
  if (!sourceIsAuthorized(records)) return "source_unauthorized";
  const production = records.deployments.some((d) => d.current && d.deploymentType === "production");
  const recent = daysBetween(at, 30);
  const joined = records.auditEvents.some((event) => time(event.occurredAt) >= recent);
  const creators = new Set(records.deployments.filter((d) => d.deploymentType === "production" && time(d.deployedAt) >= recent).map((d) => d.creatorMemberId).filter(Boolean));
  const adoption = records.members.length >= 2 && (joined || creators.size >= 2);
  if (!production && !adoption) return "production_and_shared_adoption_failed";
  if (!production) return "production_failed";
  if (!adoption) return "shared_adoption_failed";
  if (new Set(validSnapshots(records, at).map((s) => s.usageDate)).size < 3) return "sustained_use_failed";
  return null;
}
function pressureQualifies(snapshots: readonly UsageSnapshot[]): boolean {
  const comparable = snapshots.filter((s) => s.pressureState === "confirmed" && s.approvedApplicableLimit !== undefined && s.approvedApplicableLimit > 0
      && s.limitType === "hard" && s.limitScope === "team" && s.measurementWindow === "daily_utc"
      && s.measuredUsage / s.approvedApplicableLimit >= 0.8);
  const daysByComparableContract = new Map<string, Set<string>>();
  for (const snapshot of comparable) {
    const key = [snapshot.meterId, snapshot.unit, snapshot.measurementWindow, snapshot.limitType, snapshot.limitScope, snapshot.approvedApplicableLimit].join("|");
    const days = daysByComparableContract.get(key) ?? new Set<string>(); days.add(snapshot.usageDate); daysByComparableContract.set(key, days);
  }
  return [...daysByComparableContract.values()].some((days) => days.size >= 3);
}
function directQualifies(records: SourceRecords, at: string): boolean {
  const accepted = new Set(["security", "sso", "compliance", "sla", "audit_logs", "legal", "procurement", "contract"]);
  return records.requests.some((request) => request.requestState === "open" && request.inboundOrAuthorized && accepted.has(request.requestType) && time(request.requestAt) >= daysBetween(at, 14));
}
function policyFor(route: Route, policies: readonly RecipientPolicy[]): RecipientPolicy | null {
  return policies.find((p) => p.route === (route === "pressure" ? "pressure" : "direct")) ?? null;
}
function targetId(candidateId: string, recipientId: string, role: "owner" | "collaborator", channel: "slack" | "email"): string {
  const short = recipientId === "user:dx-owner" ? "dx" : recipientId === "user:marketing-owner" && role === "owner" ? "owner" : recipientId === "user:product-marketer" ? "collaborator" : recipientId === "user:marketing-owner" ? "marketing" : recipientId.replace(/[^a-zA-Z0-9]+/g, "-");
  return `DT-${candidateId}-${short}-${channel}`;
}
export function evaluateFixture(fixture: Fixture): Evaluation {
  const at = fixture.evaluationAt || EVALUATION_AT;
  const blocked = suppressionReason(fixture.records.suppression); if (blocked) return { status: "suppressed", reason: blocked };
  const common = commonGateFailure(fixture.records, at); if (common) return { status: "hold", reason: common };
  const snapshots = validSnapshots(fixture.records, at);
  const pressure = pressureQualifies(snapshots); const direct = directQualifies(fixture.records, at);
  if (!pressure && !direct) return { status: "hold", reason: "commercial_moment_failed" };
  const route: Route = pressure && direct ? "both" : pressure ? "pressure" : "direct";
  const policy = policyFor(route, fixture.recipientPolicies);
  const candidateId = `C-${fixture.records.teamId}-${POLICY_ID}`;
  const owner = policy?.recipients.find((recipient) => recipient.role === "owner");
  const validRecipients = policy?.recipients.filter((recipient): recipient is typeof recipient & { channel: "slack" | "email" } => recipient.channel === "slack" || recipient.channel === "email") ?? [];
  const deliveryBlocked = !policy || !owner?.channel || validRecipients.length !== policy.recipients.length;
  const candidate: Candidate = { id: candidateId, teamId: fixture.records.teamId, teamDisplayName: fixture.records.teamDisplayName!, route,
    recommendation: direct ? "Assign technical response" : "Review commercial play", ownerId: owner?.id ?? null, policyVersion: fixture.policyVersion,
    recipientPolicyId: policy?.id ?? "missing", recipientPolicyVersion: policy?.version ?? "missing", deliveryState: deliveryBlocked ? "delivery_blocked" : "ready" };
  const targets: DeliveryTarget[] = deliveryBlocked ? [] : validRecipients.map((recipient) => ({ id: targetId(candidateId, recipient.id, recipient.role, recipient.channel), candidateId, recipientId: recipient.id, channel: recipient.channel, urgent: direct }));
  return { status: "candidate", candidate, targets };
}
