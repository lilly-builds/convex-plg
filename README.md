# Convex Product-Led Growth Signal Finder

A synthetic-sandbox build of the V1 Serious-Team Review policy. It deliberately uses fake, named teams and test-only delivery; it does not read customer data or send real Slack/email messages.

## Build contract

**Product promise:** Given authorized synthetic evidence, create one explainable shared review for a qualifying team; otherwise hold or suppress it. Each configured recipient has exactly one selected test channel, and duplicate evaluation does not create duplicate candidates or successful sends.

**Verification tier:** Tier 3. The path combines normalized evidence, policy evaluation, persistence, concurrent deduplication, test-only delivery/retry, and a real-time operator view.

**Real entry path:** Load one fixture → normalize/evaluate → persist candidate and recipient delivery targets → test-only delivery attempt → query the candidate/evidence/attempt state.

**Required proof:** All 24 policy fixtures, duplicate race, simulated delivery outage/recovery, and a 10× workload. Tests must prove candidate, owner, target, and attempt outputs; later, the Convex path must prove the same behavior through the actual backend.

**Approved exclusions:** real customer data; customer app/end-user data; secrets; production project; live Slack/email/outreach; any claim of cross-customer internal access.

## Source specifications

The V1 General Specification, V1 Decision Policy and Data Contract, and Data Access Discovery Brief remain in the author’s separate research-notes folder and are not included in this repository. The important boundaries are summarized above; external readers should receive those documents separately if needed.

## Run the synthetic sandbox

```sh
npm install
npm test
```

That runs the in-memory policy controls. For the app and actual local Convex path, use two terminals:

```sh
# Terminal 1: local Convex backend and function watcher
npx convex dev

# Terminal 2: Vite app
npm run dev
```

With the local backend running, run the persisted verification in a third terminal:

```sh
npm run verify:local
```

The runner writes only tagged synthetic test records and keeps them out of the demo queue. It verifies all 24 P/F/E fixtures plus route upgrades, Observe feedback, recipient snapshot stability, a five-way duplicate race, simulated outage/recovery, and a 10× workload through the local Convex database. Its final JSON output includes a run ID you can use when reviewing the terminal output.

To reset the visible demo safely to its documented empty baseline, run:

```sh
npm run verify:demo-reset
```

The app's demo seed path writes only records labelled `demo:default`; the reset deletes only that allowlisted label and rejects other scopes. It is safe to run twice. Tagged verification runs (`test:<run>`) are intentionally preserved, and the reset does not clear unrelated local data.

## Portfolio artifact status

- Primary portfolio demo: `docs/media/video/convex-plg-premium-demo.mp4` (captioned, 46 seconds, high-bitrate Full HD, synthetic data only).
- Backup interaction proof: `docs/media/video/convex-plg-proof.webm`. A narrated 2–3 minute walkthrough has not been recorded.
- Screenshots/GIF: six sanitized screenshots captured in `docs/media/screenshots/`; a polished GIF is still optional.
- Convex dashboard: local backend and synthetic tables confirmed; account/dashboard proof is not confirmed.
- Demo storyboard and introduction: prepared in `docs/demo-storyboard.md` and `docs/portfolio-introduction.md`.

To inspect the data the UI reads, use:

```sh
npx convex run reviews:listCandidates '{}'
```

To inspect one returned team case in full, pass its candidate ID to `reviews:getCandidateDetails`. The delivery action records only `simulated_test_outage` or `succeeded`; it makes no Slack, email, or other network delivery.
