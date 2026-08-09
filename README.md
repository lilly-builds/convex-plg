# Convex Product-Led Growth Signal Finder

A synthetic-sandbox build of the V1 Serious-Team Review policy. It deliberately uses fake, named teams and test-only delivery; it does not read customer data or send real Slack/email messages.

## Build contract

**Product promise:** Given authorized synthetic evidence, create one explainable shared review for a qualifying team; otherwise hold or suppress it. Each configured recipient has exactly one selected test channel, and duplicate evaluation does not create duplicate candidates or successful sends.

**Verification tier:** Tier 3. The path combines normalized evidence, policy evaluation, persistence, concurrent deduplication, test-only delivery/retry, and a real-time operator view.

**Real entry path:** Load one fixture → normalize/evaluate → persist candidate and recipient delivery targets → test-only delivery attempt → query the candidate/evidence/attempt state.

**Required proof:** All 15 policy fixtures, duplicate race, simulated delivery outage/recovery, and a 10× workload. Tests must prove candidate, owner, target, and attempt outputs; later, the Convex path must prove the same behavior through the actual backend.

**Approved exclusions:** real customer data; customer app/end-user data; secrets; production project; live Slack/email/outreach; any claim of cross-customer internal access.

## Source specifications

The source specifications remain in the separate research-notes folder:

- [V1 General Specification](../convex/v1%20general%20spec.md)
- [V1 Decision Policy and Data Contract](../convex/v1%20decision%20policy%20and%20data%20contract.md)
- [Data Access Discovery Brief](../convex/data%20access%20discovery%20brief.md)

## Run the synthetic sandbox

```sh
npm install
npm test
```

That runs all 15 declared policy fixtures plus duplicate-race, simulated outage/retry, policy-update, recipient-snapshot, and 10× workload controls. For the local Convex dogfood path (still test-only), run `npx convex dev --once`, then seed `reviews:seedSyntheticFixture` with a fixture ID such as `P1`. Use `reviews:getCandidateDetails` to inspect the stored candidate, sanitized evidence, and delivery targets.

The delivery action records only `simulated_test_outage` or `succeeded`; it makes no Slack, email, or other network delivery.
