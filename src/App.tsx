import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { customerResponseDraft } from "./customerResponse";

type Row = { _id: string; teamDisplayName: string; route: string; recommendation: string; ownerId?: string; status?: string; deliveryState: string; updatedAt: string };
type Evidence = { sourceKind: string; summary?: string; observedAt: string; completeness: string; sourceAuthorized?: boolean };
type Detail = { teamDisplayName: string; candidate: Row & { recipientPolicyVersion: string }; evidence: Evidence[]; targets: Array<{ recipientId: string; channel: string; urgent: boolean; status: string }>; events: Array<{ eventType: string; details: string; occurredAt: string }> } | null;
type RunState = { scenarioNumber?: string; stage: "idle" | "running" | "complete" | "error"; message: string };

const label = (route: string) => route === "emerging" ? "Emerging" : route === "direct" ? "Direct request" : route === "both" ? "Direct + pressure" : "Pressure";
const tone = (route: string) => route === "emerging" ? "watch" : route === "direct" || route === "both" ? "urgent" : "ready";
const whyNow = (route: string) => route === "emerging" ? "Production use and team adoption are holding." : route === "pressure" ? "Sustained comparable usage pressure." : "A team request needs a technical response.";
const recipientRoleNames: Record<string, string> = {
  "user:dx-owner": "Developer Experience owner",
  "user:marketing-owner": "Marketing owner",
  "user:product-marketer": "Product marketer",
};
const displayRecipientRole = (recipientId?: string | null) => {
  if (!recipientId) return "Unassigned";
  return recipientRoleNames[recipientId] ?? recipientId.replace(/^user:/, "").split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
};
const displayEventDetails = (details: string) => details.replace(/user:[a-zA-Z0-9_-]+/g, (recipientId) => displayRecipientRole(recipientId));
const displayRecommendation = (recommendation: string) => recommendation === "Review commercial play" ? "Offer scaling support" : recommendation;
const demoQueueContext = ["P1", "E3", "E4", "E8", "E9", "TEST-race"] as const;
const scenarios = [
  { fixtureIds: ["E1", ...demoQueueContext], number: "1", name: "Growing team", description: "A team has a live app, multiple people involved, and steady use. Nothing urgent yet—just worth watching." },
  { fixtureIds: ["E5", ...demoQueueContext], number: "2", name: "Growing team hits a limit", description: "That same team has had heavy use for several days and may need help choosing the right plan." },
  { fixtureIds: ["E5", "E6", ...demoQueueContext], number: "3", name: "Growing team asks a buying question", description: "That same team asks about security, SSO, contracts, or purchasing. Route a technical reply." },
  { fixtureIds: ["P2", ...demoQueueContext], number: "4", name: "New team asks a buying question", description: "A separate serious team asks a question that needs a fast technical response." },
] as const;
function momentCopy(route: string): string {
  if (route === "emerging") return "No urgent request or limit pressure yet. This team is worth watching, not pushing.";
  if (route === "pressure") return "Comparable usage has stayed high for three complete days.";
  if (route === "both") return "The team has both sustained usage pressure and a direct enterprise request.";
  return "The team made a direct request about an enterprise need.";
}

function DecisionEvidence({ evidence, route }: { evidence: Evidence[]; route: string }) {
  const memberCount = evidence.filter((item) => item.sourceKind === "member").length;
  const usageDays = new Set(evidence.filter((item) => item.sourceKind === "usage_snapshot").map((item) => item.observedAt.slice(0, 10))).size;
  const hasProduction = evidence.some((item) => item.sourceKind === "deployment");
  const facts = [
    { label: "Live product", value: hasProduction ? "Production deployment verified" : "Production signal unavailable" },
    { label: "Team momentum", value: `${memberCount || "Multiple"} people · ${usageDays || "3"} complete usage days` },
    { label: route === "emerging" ? "What we are watching" : "What changed", value: momentCopy(route) },
  ];
  return <section className="decision-evidence"><h3>Why this is in your queue</h3><div>{facts.map((fact) => <article key={fact.label}><span>{fact.label}</span><b>{fact.value}</b></article>)}</div></section>;
}

export function App({ offline = false }: { offline?: boolean }) {
  const rows = useQuery(api.reviews.listCandidates) as Row[] | undefined;
  const decide = useMutation(api.reviews.recordDecision);
  const seedFixture = useMutation(api.reviews.seedSyntheticFixture);
  const resetDemo = useMutation(api.reviews.resetDemo);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>({ stage: "idle", message: "Choose a scenario to see the system evaluate safe demo data." });
  const [queuePhase, setQueuePhase] = useState<"idle" | "resetting" | "revealing">("idle");
  const [queueEpoch, setQueueEpoch] = useState(0);
  const [showResponseBrief, setShowResponseBrief] = useState(false);
  const details = useQuery(api.reviews.getCandidateDetails, selectedId ? { candidateId: selectedId as any } : "skip") as Detail | undefined;
  const activeTargets = details?.targets.filter((target) => target.status !== "superseded" && target.status !== "stopped") ?? [];

  if (offline) return <main className="app"><header><span className="mark">◻</span><p className="eyebrow">CONVEX · GTM SIGNAL REVIEW</p><h1>Connect a local Convex URL<br />to open the decision queue.</h1><p className="sub">This visual layer reads synthetic data only.</p></header></main>;

  const open = rows?.filter((row) => (row.status ?? "open") === "open") ?? [];
  const runFixture = async (scenario: typeof scenarios[number]) => {
    setQueuePhase("resetting");
    setRunState({ scenarioNumber: scenario.number, stage: "running", message: `Sandbox option ${scenario.number}: evaluating the selected safe scenario…` });
    try {
      const fixtureIds = [...new Set<string>(scenario.fixtureIds)];
      const minimumTransition = new Promise((resolve) => window.setTimeout(resolve, 350));
      await resetDemo({ scope: "default" });
      for (const fixtureId of fixtureIds) await seedFixture({ fixtureId });
      await minimumTransition;
      setQueueEpoch((epoch) => epoch + 1);
      setQueuePhase("revealing");
      setRunState({ scenarioNumber: scenario.number, stage: "complete", message: "" });
      window.setTimeout(() => setQueuePhase("idle"), 750);
    } catch {
      setQueuePhase("idle");
      setRunState({ scenarioNumber: scenario.number, stage: "error", message: `Sandbox option ${scenario.number}: the local sandbox could not complete the test. No outreach was attempted.` });
    }
  };
  const decideWithExplanation = (row: Row, decision: "not_now" | "suppress") => {
    const description = decision === "not_now" ? "Pause this team for 30 days? It can return after the pause if it qualifies again." : "Stop surfacing this team? This blocks future delivery until an authorized person changes the setting.";
    if (!window.confirm(description)) return;
    void decide({ candidateId: row._id as any, actorId: "user:demo-owner", decision, reason: "Synthetic UI decision" }).then(() => setSelectedId(null));
  };

  return <main className="app">
    <header className="hero"><div className="top"><span className="mark">◻</span><span>CONVEX PRODUCT-LED GROWTH SYSTEM</span><div className="header-stats"><span><b>{open.length}</b> open</span><span><b>{open.filter((row) => row.route === "emerging").length}</b> watching</span><span><b>{open.filter((row) => row.route !== "emerging").length}</b> act now</span></div><span className="live">● SANDBOX</span></div><h1>What should Convex do next, and why?</h1></header>
    <div className="workspace">
    <section className={`queue ${queuePhase === "resetting" ? "queue-resetting" : queuePhase === "revealing" ? "queue-revealing" : ""}`}><div className="queue-head"><div><p className="eyebrow">YOUR QUEUE</p><h2>Signal review</h2></div><span className="hint">Select a team to see its evidence</span></div>{rows === undefined ? <div className="loading">Loading the live queue…</div> : queuePhase === "resetting" ? <div className="queue-transition"><div className="scan-line" /><p>Rebuilding this sandbox review</p><span>Checking the team story, then refreshing the decision queue.</span></div> : <div className="table"><div className="table-row table-label"><span>TEAM</span><span>WHY NOW</span><span>RECOMMENDED RESPONSE</span><span>OWNER</span><span>STATE</span><span>NEXT ACTION</span></div>{rows.map((row, index) => <article className="table-row clickable" role="button" tabIndex={0} aria-label={`Open review for ${row.teamDisplayName}, ${label(row.route)}${row.status && row.status !== "open" ? `, ${row.status}` : ""}`} key={`${row._id}-${queueEpoch}`} style={{ animationDelay: `${index * 75}ms` }} onClick={() => { setSelectedId(row._id); setShowResponseBrief(false); }} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); setSelectedId(row._id); setShowResponseBrief(false); } }}><span><strong>{row.teamDisplayName}</strong><small>{label(row.route)}</small></span><span><i className={`dot ${tone(row.route)}`} />{whyNow(row.route)}</span><span><b>{displayRecommendation(row.recommendation)}</b></span><span>{displayRecipientRole(row.ownerId)}</span><span className={`state ${row.status ?? "open"}`}>{row.status ?? "open"}</span>{(row.status ?? "open") === "open" && <div className="actions"><button onClick={(event) => { event.stopPropagation(); decideWithExplanation(row, "not_now"); }}>Pause 30 days</button><button className="primary" onClick={(event) => { event.stopPropagation(); setSelectedId(row._id); setShowResponseBrief(true); }}>Prepare response</button></div>}</article>)}</div>}</section>
    <section className="playground" aria-label="Synthetic test data playground"><div><p className="eyebrow">SANDBOX PLAYGROUND · FAKE DATA</p><h2>See the system work for you</h2><p className="sandbox-note">These scenarios are labelled synthetic records. Running one loads a full workday of labelled fake teams into this demo queue; no customer data or messages are involved.</p>{runState.message && <p>{runState.message}</p>}<div className={`run-trace ${runState.stage}`}><span className="trace-dot" /> <b>{runState.scenarioNumber ? `Sandbox option ${runState.scenarioNumber}` : "Ready"}</b><span>{runState.stage === "running" ? "Checking signals" : runState.stage === "complete" ? "Queue updated" : runState.stage === "error" ? "Needs attention" : "Choose a scenario"}</span></div></div><div className="scenario-actions">{scenarios.map((scenario) => <button className={runState.scenarioNumber === scenario.number ? "selected" : ""} key={scenario.number} onClick={() => void runFixture(scenario)} disabled={runState.stage === "running"}><b>Sandbox option {scenario.number}</b><span>{scenario.name}</span><small>{scenario.description}</small></button>)}</div></section>
    </div>
    {selectedId && <aside className="detail-backdrop" role="presentation" onClick={() => setSelectedId(null)}><section className="detail" role="dialog" aria-modal="true" aria-label="Candidate evidence" onClick={(event) => event.stopPropagation()}><button className="close" aria-label="Close team review" onClick={() => setSelectedId(null)}>Close ×</button>{details === undefined ? <div className="loading">Loading evidence…</div> : details === null ? <div className="loading">This sandbox case is no longer available.</div> : <><p className="eyebrow">TEAM REVIEW · SYNTHETIC CASE</p><h2>{details.teamDisplayName}</h2><section className={`decision-brief ${tone(details.candidate.route)}`}><p>{label(details.candidate.route)}</p><h3>{displayRecommendation(details.candidate.recommendation)}</h3><span>{whyNow(details.candidate.route)}</span>{(details.candidate.status ?? "open") === "open" ? <div className="decision-actions"><button className="primary" onClick={() => setShowResponseBrief((shown) => !shown)}>{showResponseBrief ? "Hide response" : "Prepare response"}</button><button onClick={() => decideWithExplanation(details.candidate, "not_now")}>Pause 30 days</button></div> : <p className="terminal-note">This case is {details.candidate.status}. No further action is available.</p>}{showResponseBrief && (details.candidate.status ?? "open") === "open" && <article className="response-brief"><b>Customer reply · draft only</b><p>{customerResponseDraft(details.teamDisplayName, details.candidate.route)}</p></article>}</section><DecisionEvidence evidence={details.evidence} route={details.candidate.route} /><section className="delivery-status"><div className="delivery-heading"><div><p className="eyebrow">DELIVERY PREVIEW · TEST ONLY</p><h3>Who would receive this</h3></div><span>{activeTargets.length} recipient{activeTargets.length === 1 ? "" : "s"}</span></div><p className="delivery-note">Preview only. Nothing is sent from this sandbox.</p><div className="delivery-cards">{activeTargets.length === 0 ? <p>No delivery destination is configured for this sandbox case.</p> : activeTargets.map((target, index) => <article key={`${target.recipientId}-${index}`}><div><b>{displayRecipientRole(target.recipientId)}</b><span className={`channel ${target.channel}`}>{target.channel}</span></div><strong className={target.status}>{target.status === "pending" ? "Would be queued" : target.status === "succeeded" ? "Test delivered" : target.status}</strong><small>{target.urgent ? "Urgent response" : "Digest delivery"} · {target.channel} only</small></article>)}</div></section><section className="recent-updates"><h3>Recent updates</h3>{details.events.length === 0 ? <p>No activity yet.</p> : <ul>{details.events.slice(-3).reverse().map((event, index) => <li key={`${event.eventType}-${index}`}><b>{event.eventType === "created" ? "Added to the queue" : event.eventType === "route_upgraded" ? "Priority changed" : event.eventType.replace("decision:", "Decision: ")}</b><span>{displayEventDetails(event.details)}</span></li>)}</ul>}</section>{(details.candidate.status ?? "open") === "open" && <details className="manage-case"><summary>More options</summary><div><p>Use suppression only for no-contact, partner-managed, already-owned, or clearly wrong-fit teams. This is secondary to pausing or preparing a response.</p><button onClick={() => decideWithExplanation(details.candidate, "suppress")}>Suppress this team</button></div></details>}</>}</section></aside>}
  </main>;
}
