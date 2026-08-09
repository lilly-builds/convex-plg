export const EVALUATION_AT = "2026-08-09T12:00:00.000Z";
export const POLICY_ID = "serious_team_review";
export const POLICY_VERSION = "0.2";

export type Channel = "slack" | "email";
export type Route = "pressure" | "direct" | "both";
export type Recommendation = "Review commercial play" | "Assign technical response";
export type HoldReason =
  | "identity_failed"
  | "production_and_shared_adoption_failed"
  | "production_failed"
  | "shared_adoption_failed"
  | "sustained_use_failed"
  | "commercial_moment_failed"
  | "source_unauthorized";
export type SuppressionReason = "no_contact" | "partner_attribution" | "existing_owner_or_open_case" | "cooldown";

export interface Deployment {
  readonly id: string; readonly teamId: string; readonly deploymentType: "production" | "development";
  readonly current: boolean; readonly creatorMemberId?: string; readonly deployedAt: string; readonly sourceAuthorized: boolean;
}
export interface Member { readonly id: string; readonly teamId: string; readonly displayName: string; readonly sourceAuthorized: boolean; }
export interface AuditEvent { readonly id: string; readonly teamId: string; readonly action: "team:join" | "member:invite"; readonly occurredAt: string; readonly sourceAuthorized: boolean; }
export interface UsageSnapshot {
  readonly id: string; readonly teamId: string; readonly usageDate: string; readonly observedAt: string;
  readonly seedStatus: "complete" | "partial" | "pending"; readonly teamAttributionState: "confirmed" | "unknown";
  readonly meterId: string; readonly unit: string; readonly measurementWindow: "daily_utc";
  readonly limitType: "hard" | "none"; readonly limitScope: "team" | "deployment";
  readonly measuredUsage: number; readonly approvedApplicableLimit?: number; readonly pressureState: "confirmed" | "not_confirmed" | "unknown";
  readonly sourceAuthorized: boolean; readonly unavailableByDesign?: boolean;
}
export interface DirectRequest {
  readonly id: string; readonly teamId: string; readonly requestType: "security" | "sso" | "compliance" | "sla" | "audit_logs" | "legal" | "procurement" | "contract" | "other";
  readonly requestState: "open" | "closed"; readonly requestAt: string; readonly inboundOrAuthorized: boolean; readonly sourceAuthorized: boolean;
}
export interface Recipient { readonly id: string; readonly role: "owner" | "collaborator"; readonly channel?: Channel; }
export interface RecipientPolicy {
  readonly id: string; readonly version: string; readonly route: "pressure" | "direct";
  readonly recipients: readonly Recipient[];
}
export interface Suppression { readonly noContact: boolean; readonly partner: "none" | "partner_managed" | "unknown"; readonly existingOwner: boolean; readonly openCase: boolean; readonly cooldown: boolean; }
export interface SourceRecords {
  readonly teamId: string; readonly teamDisplayName?: string; readonly identityConfidence: "confirmed" | "unconfirmed";
  readonly deployments: readonly Deployment[]; readonly members: readonly Member[]; readonly auditEvents: readonly AuditEvent[];
  readonly usageSnapshots: readonly UsageSnapshot[]; readonly requests: readonly DirectRequest[]; readonly suppression: Suppression;
}
export interface ExpectedOutput {
  readonly status: "candidate" | "hold" | "suppressed";
  readonly reason?: HoldReason | SuppressionReason;
  readonly candidateId?: string; readonly route?: Route; readonly recommendation?: Recommendation; readonly ownerId?: string;
  readonly deliveryTargetIds: readonly string[]; readonly attemptCount: number; readonly deliveryState?: "ready" | "delivery_blocked";
}
export interface Fixture { readonly id: string; readonly evaluationAt: string; readonly policyVersion: string; readonly records: SourceRecords; readonly recipientPolicies: readonly RecipientPolicy[]; readonly expected: ExpectedOutput; }
export interface Candidate { readonly id: string; readonly teamId: string; readonly teamDisplayName: string; readonly route: Route; readonly recommendation: Recommendation; readonly ownerId: string | null; readonly policyVersion: string; readonly recipientPolicyId: string; readonly recipientPolicyVersion: string; readonly deliveryState: "ready" | "delivery_blocked"; }
export interface DeliveryTarget { readonly id: string; readonly candidateId: string; readonly recipientId: string; readonly channel: Channel; readonly urgent: boolean; }
export type Evaluation = { readonly status: "candidate"; readonly candidate: Candidate; readonly targets: readonly DeliveryTarget[] } | { readonly status: "hold"; readonly reason: HoldReason } | { readonly status: "suppressed"; readonly reason: SuppressionReason };
