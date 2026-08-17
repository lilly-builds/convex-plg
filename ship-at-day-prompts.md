# Ship-at-Day Agent Prompts — Convex Product-Led Growth System

This document turns the ship-at-day checklist into bounded prompts. Run them in order. Each later prompt assumes the earlier gate passed; an agent must report a precise status and every skipped or untested path.

## Shared context and non-negotiable boundaries

You are working on the synthetic Convex portfolio prototype in the active worktree. Read, in order, the ship-at-day plan, demo guide, latest checkpoint and later-progress note in convex build notes, the V1 specification, decision policy/data contract, emerging-team policy/data contract, prototype-to-production transition, data-access discovery brief, codex starter prompt, repository AGENTS.md, and convex/_generated/ai/guidelines.md before changing Convex code.

The product promise is: a reviewer can start from labelled fake records, see one explainable team review, understand why it appeared, see the recommended next human action, and preview (never send) a single Slack-or-email handoff. The system must not claim internal cross-customer access, use real customer/application/end-user data, include secrets, deploy to production, or send real messages. Synthetic named teams are test data only. Preserve all unrelated local Convex data. Do not weaken coverage, thresholds, retries, or providers to make checks pass.

Use the repository’s compound-engineering workflow where available: scope first, work in an isolated worktree, make a focused change, run narrow checks then the full proof, and obtain a fresh-context review. For cross-layer work, map the real path and check for drift. For major behavior, write a verification contract before editing.

Every prompt must end by reporting: status (one of the allowed statuses), files changed, commands run and their output, failures/skips/degradation/mocks, residual risk, and exact next action.

## Prompt 1 — Safe, repeatable demo reset

You are the data-safety and backend owner. Build one explicit reset for labelled fake demo records only.

Before editing, map the real demo path: UI action or command -> Convex mutation -> tables/indices -> queue query. Inspect schema and existing test-run tagging. Design the reset as an allowlisted operation: it may delete or reset only records whose keys carry the documented demo label; it must never touch unlabelled app records or local deployment state. Decide and document whether the demo starts empty or with a fixed baseline, then make both consecutive resets produce the same state.

The reset must cover all related records created by the demo path (team, candidate, evidence, evaluation attempts, candidate events, policy state, delivery targets, and delivery attempts as applicable) without orphaning children. It must be safe if run twice, safe when no labelled records exist, and reject an invalid/unlabelled scope. Keep test verification runs isolated from the visible demo queue. Add a narrow regression test that seeds labelled demo data plus a sentinel unrelated record, runs reset twice, and proves the sentinel remains. Add a real local Convex persistence check through the mutation/query boundary, not only an in-memory helper. Update README/demo instructions with the exact reset command or button and expected initial state.

Verification gate: reset twice; assert identical visible queue and zero leftover labelled records (or the documented baseline); assert sentinel/unrelated data survives; run typecheck, unit tests, build, and local Convex proof. Do not erase local Convex state or use a broad table wipe.

## Prompt 2 — Final reviewer UI and responsive pass

You are a skeptical Head of Marketing and Product Marketer reviewing the actual app, not source code. Start from the reset state and use the real browser path: run sandbox option 1, open its team, run option 2 or 3, confirm the same case upgrades without a duplicate, prepare response, pause, and inspect suppression. Review desktop and narrow/mobile widths.

Make only focused changes that improve comprehension and safety: the next action must be clear in five seconds; the queue and evidence card must use plain-language facts; Pause 30 days and Prepare response must be the two obvious actions; suppression must be secondary and explained; delivery cards must clearly say preview/test-only and show one channel per recipient; sandbox options must be visibly fake and understandable. Preserve the written policy, route behavior, accessibility, and no-real-send boundary. Add or adjust tests for any behavior changed, and use a browser/screenshot check if the repo supports one.

Verification gate: fresh reviewer can explain why the team appeared and what happens next without logs; all prior backend tests still pass; narrow layout has no clipped/hidden actions; no UI text implies real data or delivery. Report visual observations separately from inference.

## Prompt 3 — Optional linked local Convex dashboard proof

You are the local-environment and evidence owner. Inspect generated/uncommitted setup files first; do not delete, stash, reset, or commit them blindly. Confirm account/link state safely. If an older local backend occupies the port, identify it and restart only the linked local backend without deleting local state.

Open the linked local Convex dashboard and compare it with the reset app. Confirm the visible records are synthetic only and match the app’s case, evidence, route, owner, delivery targets, and history. Capture one sanitized screenshot or short proof clip only if it strengthens the story; do not expose credentials, deployment secrets, or unrelated rows. If account/dashboard access is unavailable, label this optional step blocked without altering product scope, and preserve the local proof as the source of truth.

Verification gate: record the exact deployment/dashboard identity in private notes only, confirm synthetic-only data, and state whether dashboard proof is available. Never call this production verification.

## Prompt 4 — Final local Convex verification pack

You are the backend verification owner. Read the current policy and schema, then run the real local verification command after all final code changes. It must cover every normal, hold, and suppression fixture; Emerging -> pressure, Emerging -> direct, and pressure -> direct upgrades; Observe feedback; stable recipient snapshot; five parallel entries for one account; simulated delivery failure and recovery; and 10x workload. Confirm persisted candidates, evidence, owners, target idempotency, history, attempts, and recovery—not just exit code.

If anything fails, reproduce the smallest failing path, fix the root cause without reducing volume or coverage, and rerun the narrow check plus the full pack. Record exact output and any environment limitations. Add regression coverage for new fixes. This gate is local verification only; do not claim production proof or real external delivery.

## Prompt 5 — Demo and portfolio package

You are the portfolio storyteller. Use the existing demo guide and the verified real path. Prepare a concise README, 2–3 minute storyboard/script, captions or transcript, screenshot/GIF plan, and short introduction. Keep the direct GTM Engineer connection central: serious team momentum -> threshold/intent -> one explainable owner/play -> safe delivery preview -> operational proof -> honest production boundary.

Include links to the V1 spec, decision policy/data contract, emerging policy, data-access discovery brief, and prototype-to-production transition note. Explicitly state synthetic-only data, no customer/application/end-user content, no public-API inference about internal access, no real Slack/email send, and no production readiness. Do not invent metrics or claim proof not present in command output. Keep the package usable by a fresh reader.

Verification gate: run the documented demo from reset, compare every claim against code/tests/docs, and ensure the script can be followed with sound off from the UI labels alone.

## Prompt 6 — Final share and repository safety check

You are the release reviewer. Inspect git status, tracked and untracked files, generated setup files, local config, ignored data, dependencies, and documentation. Decide intentionally what belongs in the shareable repository. Do not include secrets, tokens, local database files, customer rows, or misleading generated artifacts. Do not modify another agent’s work or remove user-generated setup without explicit authorization.

Run the final required checks and local proof one last time. Perform a fresh-context review against the real entry path, schema/contracts, UI mount, synthetic boundary, and demo instructions. Review the video/screenshot package with sound off if available. Produce a release checklist listing what is proven, what is optional/unavailable, and what owner approval is still required (visual taste, repository visibility, publishing under the user’s name).

The only acceptable final recommendation is a precise status: locally verified, implemented not fully tested, partially working, blocked, or failed verification. Never call the package production verified without live authorized evidence.
