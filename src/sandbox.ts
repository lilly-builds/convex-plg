import type { Candidate, DeliveryTarget, Evaluation, Fixture } from "./model.js";
import { evaluateFixture } from "./policy.js";

export interface Attempt { readonly targetId: string; readonly outcome: "failed" | "succeeded"; readonly error?: string; }
export class SyntheticSandbox {
  readonly candidates = new Map<string, Candidate>();
  readonly targets = new Map<string, DeliveryTarget & { status: "pending" | "failed" | "succeeded" | "superseded" }>();
  readonly attempts: Attempt[] = [];
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
        for (const target of result.targets) if (!this.targets.has(target.id)) this.targets.set(target.id, { ...target, status: "pending" });
      } else this.candidates.set(existing.id, { ...existing, policyVersion: result.candidate.policyVersion });
      return result;
    }
    this.candidates.set(result.candidate.id, result.candidate);
    for (const target of result.targets) this.targets.set(target.id, { ...target, status: "pending" });
    return result;
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
