import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient(process.env.CONVEX_URL ?? "http://127.0.0.1:3210");
const call = (name, args) => client.mutation(name, args);
const query = (name, args) => client.query(name, args);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const zeroCounts = (state) => Object.values(state.counts).every((count) => count === 0);

// Establish the documented empty baseline first so this proof is repeatable
// even when a previous demo capture left labelled records behind.
await call("reviews:resetDemo", { scope: "default" });
const demo = await call("reviews:seedSyntheticFixture", { fixtureId: "P1" });
await call("reviews:recordDecision", { candidateId: demo.candidateId, actorId: "user:demo-owner", decision: "not_now", reason: "Reset verification" });
const sentinelTag = `reset-sentinel-${Date.now()}`;
const sentinel = await call("reviews:seedSyntheticFixture", { fixtureId: "P1", testRunId: sentinelTag });
const before = await query("reviews:getDemoResetState", { scope: "default" });
assert(before.counts.candidates === 1 && before.counts.teams === 1, "expected labelled demo records before reset");

const first = await call("reviews:resetDemo", { scope: "default" });
const afterFirst = await query("reviews:getDemoResetState", { scope: "default" });
const second = await call("reviews:resetDemo", { scope: "default" });
const afterSecond = await query("reviews:getDemoResetState", { scope: "default" });
assert(zeroCounts(afterFirst) && zeroCounts(afterSecond), "reset left labelled records behind");
assert(Object.values(second.counts).every((count) => count === 0), "second reset was not idempotent");
const sentinelState = await query("reviews:getEvaluationState", { externalTeamId: "T-serious", testRunId: sentinelTag });
assert(sentinelState.evaluationCount === 1 && sentinelState.candidateCount === 1, "unrelated test-run data was removed");
const queue = await query("reviews:listCandidates", {});
assert(queue.length === 0, "reset did not empty the visible demo queue");
let rejected = false;
try { await call("reviews:resetDemo", { scope: "all" }); } catch { rejected = true; }
assert(rejected, "unallowlisted reset scope was accepted");
console.log(JSON.stringify({ status: "passed", baseline: "empty", firstReset: first.counts, secondReset: second.counts, unrelatedTestRunPreserved: true }, null, 2));
