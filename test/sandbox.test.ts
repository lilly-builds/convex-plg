import { describe, expect, it } from "vitest";
import { fixtures, fixtureById } from "../src/fixtures.js";
import { SyntheticSandbox } from "../src/sandbox.js";

const ids = (fixtureId: string) => fixtureById(fixtureId).expected.deliveryTargetIds;

describe("synthetic sandbox acceptance controls", () => {
  it("runs every fixture and persists only expected candidate outputs", async () => {
    for (const fixture of fixtures) {
      const sandbox = new SyntheticSandbox();
      const result = await sandbox.apply(fixture);
      expect(result.status).toBe(fixture.expected.status);
      expect(sandbox.candidates.size).toBe(fixture.expected.status === "candidate" ? 1 : 0);
      expect(sandbox.targets.size).toBe(fixture.expected.deliveryTargetIds.length);
      expect(sandbox.attempts).toHaveLength(fixture.expected.attemptCount);
    }
  });

  it("F8 duplicate race records five evaluations but only one candidate and two targets", async () => {
    const sandbox = new SyntheticSandbox();
    await Promise.all(Array.from({ length: 5 }, () => sandbox.apply(fixtureById("F8"))));
    expect(sandbox.evaluations).toHaveLength(5);
    expect(sandbox.candidates.size).toBe(1);
    expect(sandbox.targets.size).toBe(2);
  });

  it("records a test-only outage, safely retries, and permits exactly one success", async () => {
    const sandbox = new SyntheticSandbox(); await sandbox.apply(fixtureById("P1"));
    const [target] = ids("P1"); expect(target).toBeDefined();
    expect(sandbox.dispatchTestOnly(target!, "outage")).toEqual({ recorded: true, outcome: "failed" });
    expect(sandbox.dispatchTestOnly(target!, "success")).toEqual({ recorded: true, outcome: "succeeded" });
    expect(sandbox.dispatchTestOnly(target!, "success")).toEqual({ recorded: false });
    expect(sandbox.attempts).toHaveLength(2);
    expect(sandbox.attempts.filter((attempt) => attempt.outcome === "succeeded")).toHaveLength(1);
  });

  it("F10 updates evidence version without a second candidate or delivery targets", async () => {
    const sandbox = new SyntheticSandbox(); await sandbox.apply(fixtureById("P1")); await sandbox.apply(fixtureById("F10"));
    expect(sandbox.candidates.size).toBe(1); expect(sandbox.targets.size).toBe(2);
    expect(sandbox.candidates.get("C-T-serious-team_review")?.policyVersion).toBe("0.3");
  });

  it("F12 keeps the original recipient snapshot when config changes after creation", async () => {
    const sandbox = new SyntheticSandbox(); const first = fixtureById("F12"); await sandbox.apply(first);
    const changed = { ...first, recipientPolicies: [{ ...first.recipientPolicies[0]!, version: "2", recipients: [{ id: "user:new-owner", role: "owner" as const, channel: "email" as const }] }] };
    await sandbox.apply(changed);
    expect(sandbox.candidates.get("C-T-config-team_review")?.ownerId).toBe("user:marketing-owner");
    expect([...sandbox.targets.values()].map((target) => target.recipientId)).toEqual(["user:marketing-owner", "user:product-marketer"]);
  });

  it("processes a 10x fixture workload without losing evaluations or creating duplicate target keys", async () => {
    const sandbox = new SyntheticSandbox();
    await Promise.all(Array.from({ length: 10 }, () => fixtures.map((fixture) => sandbox.apply(fixture))).flat());
    expect(sandbox.evaluations).toHaveLength(fixtures.length * 10);
    expect(sandbox.targets.size).toBe(new Set(sandbox.targets.keys()).size);
    expect([...sandbox.targets.values()].filter((target) => target.status === "succeeded")).toHaveLength(0);
  });
});

it("upgrades P1 to P3 on the same candidate, switches to the DX owner, and supersedes old unsent targets", async () => {
  const sandbox = new SyntheticSandbox();
  await sandbox.apply(fixtureById("P1")); await sandbox.apply(fixtureById("P3"));
  const candidate = sandbox.candidates.get("C-T-serious-team_review");
  expect(candidate).toMatchObject({ route: "both", ownerId: "user:dx-owner", recommendation: "Assign technical response" });
  expect([...sandbox.targets.values()].filter((target) => target.status === "pending").map((target) => target.recipientId)).toEqual(["user:dx-owner", "user:marketing-owner"]);
  expect([...sandbox.targets.values()].filter((target) => target.status === "superseded")).toHaveLength(2);
});
