import type { Candidate, DeliveryTarget, Evaluation, Fixture } from "./model.js";
import { evaluateFixture } from "./policy.js";

export interface Attempt { readonly targetId: string; readonly outcome: "failed" | "succeeded"; readonly error?: string; }
export interface Decision { readonly candidateId: string; readonly actorId: string; readonly decision: "observe"; readonly reason: string; }
export class SyntheticSandbox {
  readonly candidates = new Map<string, Candidate>();
  readonly targets = new Map<string, DeliveryTarget & { status: "pending" | "failed" | "succeeded" | "superseded" }>();
  readonly attempts: Attempt[] = [];
  readonly decisions: Decision[] = [];
  readonly evaluations: { fixtureId: string; result: Evaluation }[] = [];

  async apply(fixture: Fixture): Promise<Evaluation> {
    const result = evaluateFixture(fixture);
    this.evaluations.push({ fixtureId: fixture.id, result });
    if (result.status !== "candidate") return result;
    const existing = this.candidates.get(result.candidate.id);
    if (existing) {
      const directUpgrade = existing.route !== result.candidate.route && (result.candidate.route === "direct" || result.candidate.route === "both");
      if (directUpgrade) {
        this.candidates.set(existing.id, { ...result.candidate });
        const required = new Set(result.targets.map((target) => target.id));
        for (const [id, target] of this.targets) if (!required.has(id) && target.status !== "succeeded") this.targets.set(id, { ...target, status: "superseded" });
        for (const target of result.targets) {
          const existingTarget = this.targets.get(target.id);
          if (!existingTarget) this.targets.set(target.id, { ...target, status: "pending" });
          else if (existingTarget.status !== "succeeded") this.targets.set(target.id, { ...existingTarget, urgent: target.urgent });
        }
      } else this.candidates.set(existing.id, { ...existing, policyVersion: result.candidate.policyVersion });
      return result;
    }
    this.candidates.set(result.candidate.id, result.candidate);
    for (const target of result.targets) this.targets.set(target.id, { ...target, status: "pending" });
    return result;
  }

  recordObserve(candidateId: string, actorId: string, reason: string): { recorded: boolean } {
    const candidate = this.candidates.get(candidateId);
    if (!candidate || candidate.route !== "emerging") return { recorded: false };
    this.decisions.push({ candidateId, actorId, decision: "observe", reason });
    return { recorded: true };
  }

  dispatchTestOnly(targetId: string, simulate: "outage" | "success"): { recorded: boolean; outcome?: "failed" | "succeeded" } {
    const target = this.targets.get(targetId); if (!target) throw new Error(`Unknown target ${targetId}`);
    if (target.status === "succeeded") return { recorded: false };
    const outcome = simulate === "success" ? "succeeded" : "failed";
    this.attempts.push({ targetId, outcome, ...(outcome === "failed" ? { error: "simulated_test_outage" } : {}) });
    this.targets.set(targetId, { ...target, status: outcome });
    return { recorded: true, outcome };
  }
}
