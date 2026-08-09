import { describe, expect, it } from "vitest";
import { fixtures } from "../src/fixtures.js";
import { evaluateFixture } from "../src/policy.js";

describe("serious-team review synthetic fixture pack", () => {
  it.each(fixtures)("$id matches its expected structured output", (fixture) => {
    const result = evaluateFixture(fixture);
    expect(result.status).toBe(fixture.expected.status);
    if (result.status === "candidate") {
      expect(result.candidate.id).toBe(fixture.expected.candidateId);
      expect(result.candidate.route).toBe(fixture.expected.route);
      expect(result.candidate.recommendation).toBe(fixture.expected.recommendation);
      expect(result.candidate.ownerId).toBe(fixture.expected.ownerId ?? null);
      expect(result.candidate.deliveryState).toBe(fixture.expected.deliveryState);
      expect(result.targets.map((target) => target.id)).toEqual(fixture.expected.deliveryTargetIds);
    } else {
      expect(result.reason).toBe(fixture.expected.reason);
    }
  });
});

it("holds a record that maps to a different team and does not count repeated pressure for one day", () => {
  const p1 = fixtures.find((fixture) => fixture.id === "P1")!;
  const mismatched = { ...p1, records: { ...p1.records, usageSnapshots: p1.records.usageSnapshots.map((snapshot, index) => index === 0 ? { ...snapshot, teamId: "T-other" } : snapshot) } };
  expect(evaluateFixture(mismatched).status).toBe("hold");
  const repeatedPressure = { ...p1, records: { ...p1.records, usageSnapshots: [
    ...p1.records.usageSnapshots.map((snapshot) => ({ ...snapshot, pressureState: "not_confirmed" as const })),
    ...p1.records.usageSnapshots.slice(0, 1).flatMap((snapshot, index) => [1, 2, 3].map((copy) => ({ ...snapshot, id: `${snapshot.id}-duplicate-${copy}`, pressureState: "confirmed" as const, measuredUsage: 90000 + index }))),
  ] } };
  expect(evaluateFixture(repeatedPressure)).toMatchObject({ status: "hold", reason: "commercial_moment_failed" });
});
