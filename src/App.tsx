import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type Row = { _id: string; teamDisplayName: string; route: string; recommendation: string; ownerId?: string; status?: string; deliveryState: string; updatedAt: string };
type Evidence = { sourceKind: string; summary?: string; observedAt: string; completeness: string; sourceAuthorized?: boolean };
type Detail = { teamDisplayName: string; candidate: Row & { recipientPolicyVersion: string }; evidence: Evidence[]; targets: Array<{ recipientId: string; channel: string; urgent: boolean; status: string }>; events: Array<{ eventType: string; details: string; occurredAt: string }> } | null;
type RunState = { fixtureId?: string; stage: "idle" | "running" | "complete" | "error"; message: string };

const label = (route: string) => route === "emerging" ? "Emerging" : route === "direct" ? "Direct request" : route === "both" ? "Direct + pressure" : "Pressure";
const tone = (route: string) => route === "emerging" ? "watch" : route === "direct" || route === "both" ? "urgent" : "ready";
const whyNow = (route: string) => route === "emerging" ? "Production use and team adoption are holding." : route === "pressure" ? "Sustained comparable usage pressure." : "A team request needs a technical response.";
const scenarios = [
  { id: "E1", name: "Growing team", description: "A team has a live app, multiple people involved, and steady use. Nothing urgent yet—just worth watching." },
  { id: "E5", name: "Growing team hits a limit", description: "That same team has had heavy use for several days and may need help choosing the right plan." },
  { id: "E6", name: "Growing team asks a buying question", description: "That same team asks about security, SSO, contracts, or purchasing. Route a technical reply." },
  { id: "P2", name: "New team asks a buying question", description: "A separate serious team asks a question that needs a fast technical response." },
] as const;
const sourceLabel = (kind: string) => kind.replaceAll("_", " ");

function EvidencePath({ evidence, route }: { evidence: Evidence[]; route: string }) {
  const foundation = evidence.filter((item) => ["deployment", "member", "audit"].includes(item.sourceKind));
  const use = evidence.filter((item) => item.sourceKind === "usage_snapshot");
  const moment = evidence.filter((item) => item.sourceKind === "direct_request" || (item.sourceKind === "usage_snapshot" && item.summary?.includes("confirmed")));
  const stages = [
    { title: "Team foundation", caption: "Who and what was verified", items: foundation, state: "complete" },
    { title: "Sustained use", caption: "Three complete team-level days", items: use, state: "complete" },
    { title: route === "emerging" ? "Watch state" : "Decision moment", caption: route === "emerging" ? "No urgent moment yet" : whyNow(route), items: moment, state: route === "emerging" ? "watch" : "moment" },
  ];
  return <section className="signal-path"><div className="section-heading"><div><p className="eyebrow">HOW THIS WAS FOUND</p><h3>Signal path</h3></div><span>{label(route)}</span></div>{stages.map((stage, index) => <article className={`signal-stage ${stage.state}`} key={stage.title}><div className="stage-index">0{index + 1}</div><div><h4>{stage.title}</h4><p>{stage.caption}</p></div><div className="stage-facts">{stage.items.length === 0 ? <span>Waiting for a qualifying moment</span> : stage.items.slice(0, 3).map((item, itemIndex) => <span key={`${item.sourceKind}-${itemIndex}`}><b>{sourceLabel(item.sourceKind)}</b>{item.summary ?? item.completeness}</span>)}</div></article>)}</section>;
}

export function App({ offline = false }: { offline?: boolean }) {
  const rows = useQuery(api.reviews.listCandidates) as Row[] | undefined;
  const decide = useMutation(api.reviews.recordDecision);
  const seedFixture = useMutation(api.reviews.seedSyntheticFixture);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>({ stage: "idle", message: "Choose a scenario to see the system evaluate safe demo data." });
  const [showResponseBrief, setShowResponseBrief] = useState(false);
  const details = useQuery(api.reviews.getCandidateDetails, selectedId ? { candidateId: selectedId as any } : "skip") as Detail | undefined;

  if (offline) return <main className="app"><header><span className="mark">◻</span><p className="eyebrow">CONVEX · GTM SIGNAL REVIEW</p><h1>Connect a local Convex URL<br />to open the decision queue.</h1><p className="sub">This visual layer reads synthetic data only.</p></header></main>;

  const open = rows?.filter((row) => (row.status ?? "open") === "open") ?? [];
  const runFixture = async (fixtureId: typeof scenarios[number]["id"]) => {
    setRunState({ fixtureId, stage: "running", message: `${fixtureId}: evaluating the selected safe scenario…` });
    try {
      const result = await seedFixture({ fixtureId });
      const outcome = result.status === "created" ? "Created a new shared team case" : "Updated the matching shared team case";
      setRunState({ fixtureId, stage: "complete", message: `${fixtureId}: ${outcome}. The queue refreshed from the sandbox.` });
    } catch {
      setRunState({ fixtureId, stage: "error", message: `${fixtureId}: the local sandbox could not complete the test. No outreach was attempted.` });
    }
  };
  const decideWithExplanation = (row: Row, decision: "not_now" | "suppress") => {
    const description = decision === "not_now" ? "Pause this team for 30 days? It can return after the pause if it qualifies again." : "Stop surfacing this team? This blocks future delivery until an authorized person changes the setting.";
    if (!window.confirm(description)) return;
    void decide({ candidateId: row._id as any, actorId: "user:demo-owner", decision, reason: "Synthetic UI decision" });
  };

  return <main className="app">
    <header className="hero"><div className="top"><span className="mark">◻</span><span>CONVEX PRODUCT-LED GROWTH SYSTEM</span><span className="live">● SANDBOX</span></div><p className="eyebrow">MARKETING DECISION QUEUE</p><h1>What should Convex do next,<br />and why?</h1></header>
    <section className="metrics"><div><b>{open.length}</b><span>Open decisions</span></div><div><b>{open.filter((row) => row.route === "emerging").length}</b><span>Worth watching</span></div><div><b>{open.filter((row) => row.route !== "emerging").length}</b><span>Act now</span></div></section>
    <section className="queue"><div className="queue-head"><div><p className="eyebrow">YOUR QUEUE</p><h2>Signal review</h2></div><span className="hint">Select a team to see its evidence</span></div>{rows === undefined ? <div className="loading">Loading the live queue…</div> : <div className="table"><div className="table-row table-label"><span>TEAM</span><span>WHY NOW</span><span>RECOMMENDED RESPONSE</span><span>OWNER</span><span>STATE</span></div>{rows.map((row) => <article className="table-row clickable" key={row._id} onClick={() => { setSelectedId(row._id); setShowResponseBrief(false); }}><span><strong>{row.teamDisplayName}</strong><small>{label(row.route)}</small></span><span><i className={`dot ${tone(row.route)}`} />{whyNow(row.route)}</span><span><b>{row.recommendation}</b></span><span>{row.ownerId?.replace("user:", "") ?? "Unassigned"}</span><span className={`state ${row.status ?? "open"}`}>{row.status ?? "open"}</span>{(row.status ?? "open") === "open" && <div className="actions"><div><button onClick={(event) => { event.stopPropagation(); decideWithExplanation(row, "not_now"); }}>Pause 30 days</button><small>Returns only after the pause if it qualifies again.</small></div><div><button className="primary" onClick={(event) => { event.stopPropagation(); decideWithExplanation(row, "suppress"); }}>Suppress this team</button><small>Stops future delivery until changed by an authorized person.</small></div></div>}</article>)}</div>}</section>
    <section className="playground" aria-label="Synthetic test data playground"><div><p className="eyebrow">SANDBOX PLAYGROUND</p><h2>See the system work for you</h2><p>{runState.message}</p><div className={`run-trace ${runState.stage}`}><span className="trace-dot" /> <b>{runState.fixtureId ?? "Ready"}</b><span>{runState.stage === "running" ? "Checking signals" : runState.stage === "complete" ? "Queue updated" : runState.stage === "error" ? "Needs attention" : "Choose a scenario"}</span></div></div><div className="scenario-actions">{scenarios.map((scenario) => <button className={runState.fixtureId === scenario.id ? "selected" : ""} key={scenario.id} onClick={() => void runFixture(scenario.id)} disabled={runState.stage === "running"}><b>Sandbox example {scenario.id}</b><span>{scenario.name}</span><small>{scenario.description}</small></button>)}</div></section>
    {selectedId && <aside className="detail-backdrop" role="presentation" onClick={() => setSelectedId(null)}><section className="detail" role="dialog" aria-modal="true" aria-label="Candidate evidence" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelectedId(null)}>Close ×</button>{details === undefined ? <div className="loading">Loading evidence…</div> : details === null ? <div className="loading">This sandbox case is no longer available.</div> : <><p className="eyebrow">EVIDENCE CARD · SANDBOX</p><h2>{details.teamDisplayName}</h2><p className="detail-lede">{label(details.candidate.route)} · {details.candidate.recommendation}</p><EvidencePath evidence={details.evidence} route={details.candidate.route} /><section className="response-hub"><div><p className="eyebrow">NEXT STEP</p><h3>Response hub</h3><p>Prepare the handoff here. A real Slack or email link appears only after an approved integration is configured.</p></div><button onClick={() => setShowResponseBrief((shown) => !shown)}>{showResponseBrief ? "Hide response brief" : "Prepare response brief"}</button>{showResponseBrief && <article className="response-brief"><b>{details.candidate.recommendation}</b><p>Team: {details.teamDisplayName}. Why now: {whyNow(details.candidate.route)}. Owner: {details.candidate.ownerId?.replace("user:", "") ?? "Unassigned"}.</p><span>Delivery destinations: {details.targets.map((target) => `${target.recipientId.replace("user:", "")} via ${target.channel}`).join(" · ") || "not configured"}</span></article>}</section><section className="history"><h3>Case history</h3>{details.events.length === 0 ? <p>No decision recorded yet.</p> : <ul>{details.events.map((event, index) => <li key={`${event.eventType}-${index}`}><b>{event.eventType.replace("_", " ")}</b><span>{event.details}</span></li>)}</ul>}<h3>Delivery status</h3><ul>{details.targets.map((target, index) => <li key={`${target.recipientId}-${index}`}><b>{target.recipientId.replace("user:", "")}</b><span>{target.channel} · {target.urgent ? "urgent" : "digest"} · {target.status}</span></li>)}</ul></section></>}</section></aside>}
  </main>;
}
