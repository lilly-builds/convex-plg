import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const client = new ConvexHttpClient(url);
const prefix = `verify_${Date.now()}`;
const candidates = {
  P1: ["pressure", "user:marketing-owner", 2], P2: ["direct", "user:dx-owner", 2], P3: ["both", "user:dx-owner", 2],
  F8: ["pressure", "user:marketing-owner", 2], F9: ["pressure", "user:marketing-owner", 0], F10: ["pressure", "user:marketing-owner", 2], F12: ["pressure", "user:marketing-owner", 2],
  E1: ["emerging", "user:product-marketer", 2], E3: ["pressure", "user:marketing-owner", 2], E4: ["direct", "user:dx-owner", 2], E5: ["pressure", "user:marketing-owner", 2], E6: ["direct", "user:dx-owner", 2], E8: ["emerging", "user:product-marketer", 2], E9: ["emerging", "user:product-marketer", 2],
};
const held = new Set(["F1", "F2", "F3", "F4", "F5", "F6", "F11", "E2"]);
const suppressed = new Set(["F7", "E7"]);
const allFixtures = ["P1", "P2", "P3", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9"];
const teamFor = { P1:"T-serious", P2:"T-request", P3:"T-serious", F1:"T-solo", F2:"T-launch", F3:"T-healthy", F4:"T-partial", F5:"T-unconfirmed", F6:"T-bad-request", F7:"T-suppressed", F8:"T-serious", F9:"T-routing-gap", F10:"T-serious", F11:"T-boundary", F12:"T-config", E1:"T-emerging", E2:"T-emerging-short", E3:"T-emerging-pressure", E4:"T-emerging-direct", E5:"T-emerging", E6:"T-emerging", E7:"T-emerging-suppressed", E8:"T-emerging-observe", E9:"T-emerging-config" };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const runId = (label) => `${prefix}_${label}`;
async function seed(fixtureId, tag) { return client.mutation("reviews:seedSyntheticFixture", { fixtureId, testRunId: tag }); }
async function details(candidateId) { return client.query("reviews:getCandidateDetails", { candidateId }); }
async function state(team, tag) { return client.query("reviews:getEvaluationState", { externalTeamId: team, testRunId: tag }); }

async function verifyFixture(fixtureId) {
  const tag = runId(fixtureId);
  const result = await seed(fixtureId, tag);
  if (held.has(fixtureId)) { assert(result.status === "hold", `${fixtureId}: expected hold`); return; }
  if (suppressed.has(fixtureId)) { assert(result.status === "suppressed", `${fixtureId}: expected suppression`); return; }
  const [route, ownerId, targetCount] = candidates[fixtureId];
  assert(result.candidateId, `${fixtureId}: missing candidate ID`);
  const record = await details(result.candidateId);
  assert(record?.candidate.route === route, `${fixtureId}: wrong route`);
  assert(record?.candidate.ownerId === ownerId, `${fixtureId}: wrong owner`);
  assert(record?.targets.length === targetCount, `${fixtureId}: wrong target count`);
  assert(record?.evidence.length > 0, `${fixtureId}: no persisted evidence`);
}

async function waitFor(predicate, label) { for (let i = 0; i < 50; i += 1) { if (await predicate()) return; await pause(100); } throw new Error(`Timed out: ${label}`); }

async function progression(first, second, expectedRoute, expectedOwner) {
  const tag = runId(`${first}_${second}`); const firstResult = await seed(first, tag); const secondResult = await seed(second, tag);
  assert(firstResult.candidateId && secondResult.candidateId === firstResult.candidateId, `${first}->${second}: must retain one candidate`);
  const record = await details(firstResult.candidateId);
  assert(record?.candidate.route === expectedRoute && record.candidate.ownerId === expectedOwner, `${first}->${second}: owner/route not upgraded`);
  assert(record.events.some((event) => event.eventType === "route_upgraded"), `${first}->${second}: missing upgrade history`);
}

for (const fixtureId of allFixtures) await verifyFixture(fixtureId);
await progression("P1", "P3", "both", "user:dx-owner");
await progression("E1", "E5", "pressure", "user:marketing-owner");
await progression("E1", "E6", "direct", "user:dx-owner");

const observeTag = runId("observe"); const observe = await seed("E8", observeTag);
await client.mutation("reviews:recordDecision", { candidateId: observe.candidateId, actorId: "user:product-marketer", decision: "observe", reason: "Synthetic observation" });
assert((await details(observe.candidateId)).events.some((event) => event.eventType === "decision:observe"), "E8: Observe was not recorded");

const snapshotTag = runId("snapshot"); const e9 = await seed("E9", snapshotTag); await seed("TEST-E9-config-change", snapshotTag);
const snapshot = await details(e9.candidateId); assert(snapshot?.candidate.ownerId === "user:product-marketer", "E9: recipient snapshot drifted");

const raceTag = runId("race"); await Promise.all(Array.from({ length: 5 }, () => seed("F8", raceTag)));
const race = await state("T-serious", raceTag); assert(race.evaluationCount === 5 && race.candidateCount === 1 && race.deliveryTargetCount === 2, "race: duplicate protection failed");

const deliveryTag = runId("delivery"); const deliveryFixture = await seed("P1", deliveryTag); let delivery = await client.query("reviews:getDeliveryState", { candidateId: deliveryFixture.candidateId });
await client.mutation("reviews:queueTestOnlyDelivery", { targetId: delivery[0]._id, simulate: "outage" });
await waitFor(async () => { delivery = await client.query("reviews:getDeliveryState", { candidateId: deliveryFixture.candidateId }); return delivery[0].attempts.some((attempt) => attempt.outcome === "failed") && delivery[0].attempts.some((attempt) => attempt.outcome === "succeeded"); }, "test-only outage recovery");
assert(delivery[0].status === "succeeded", "delivery: expected recovered success");

const loadTag = runId("load"); await Promise.all(Array.from({ length: 10 }, () => allFixtures.map((fixtureId) => seed(fixtureId, `${loadTag}_${fixtureId}`))).flat());
for (const fixtureId of allFixtures) { const check = await state(teamFor[fixtureId], `${loadTag}_${fixtureId}`); assert(check.evaluationCount === 10, `${fixtureId}: 10x workload lost evaluations`); }
console.log(JSON.stringify({ status: "passed", runId: prefix, fixtures: allFixtures.length, controls: ["P1->P3", "E1->E5", "E1->E6", "E8 observe", "E9 snapshot", "race", "outage/recovery", "10x"] }, null, 2));
