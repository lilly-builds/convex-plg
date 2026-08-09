import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type Row = { _id: string; teamDisplayName: string; route: string; recommendation: string; ownerId?: string; status?: string; deliveryState: string; updatedAt: string };
type Detail = { teamDisplayName: string; candidate: Row & { recipientPolicyVersion: string }; evidence: Array<{ sourceKind: string; summary?: string; observedAt: string; completeness: string; sourceAuthorized?: boolean }>; targets: Array<{ recipientId: string; channel: string; urgent: boolean; status: string }>; events: Array<{ eventType: string; details: string; occurredAt: string }> } | null;

const label = (route: string) => route === "emerging" ? "Emerging" : route === "direct" ? "Direct request" : route === "both" ? "Direct + pressure" : "Pressure";
const tone = (route: string) => route === "emerging" ? "watch" : route === "direct" || route === "both" ? "urgent" : "ready";
const whyNow = (route: string) => route === "emerging" ? "Production use and team adoption are holding." : route === "pressure" ? "Sustained comparable usage pressure." : "A team request needs a technical response.";
const scenarios = [
  { id: "E1", name: "Early momentum", description: "Create an Emerging Serious Team observation." },
  { id: "E5", name: "Pressure upgrade", description: "Upgrade Emerging to commercial pressure." },
  { id: "E6", name: "Direct request upgrade", description: "Upgrade Emerging to a technical response." },
  { id: "P2", name: "New direct request", description: "Create a separate urgent team review." },
] as const;

export function App({ offline = false }: { offline?: boolean }) {
  const rows = useQuery(api.reviews.listCandidates) as Row[] | undefined;
  const decide = useMutation(api.reviews.recordDecision);
  const seedFixture = useMutation(api.reviews.seedSyntheticFixture);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fixtureNote, setFixtureNote] = useState("Choose a synthetic scenario to populate the demo.");
  const details = useQuery(api.reviews.getCandidateDetails, selectedId ? { candidateId: selectedId as any } : "skip") as Detail | undefined;

  if (offline) return <main className="app"><header><span className="mark">◻</span><p className="eyebrow">CONVEX · GTM SIGNAL REVIEW</p><h1>Connect a local Convex URL<br />to open the decision queue.</h1><p className="sub">This visual layer reads synthetic data only.</p></header></main>;

  const open = rows?.filter((row) => (row.status ?? "open") === "open") ?? [];
  const runFixture = async (fixtureId: typeof scenarios[number]["id"]) => {
    setFixtureNote(`Running ${fixtureId} in the synthetic sandbox…`);
    try {
      const result = await seedFixture({ fixtureId });
      setFixtureNote(`${fixtureId} recorded: ${result.status}. The queue updated with synthetic data.`);
    } catch {
      setFixtureNote(`${fixtureId} could not run. The local synthetic sandbox may not be available.`);
    }
  };

  return <main className="app">
    <header className="hero"><div className="top"><span className="mark">◻</span><span>CONVEX PRODUCT-LED GROWTH SYSTEM</span><span className="live">● SANDBOX</span></div><p className="eyebrow">MARKETING DECISION QUEUE</p><h1>What should Convex do next,<br />and why?</h1></header>
    <section className="metrics"><div><b>{open.length}</b><span>Open decisions</span></div><div><b>{open.filter((row) => row.route === "emerging").length}</b><span>Worth watching</span></div><div><b>{open.filter((row) => row.route !== "emerging").length}</b><span>Act now</span></div></section>
    <section className="playground" aria-label="Synthetic test data playground"><div><p className="eyebrow">SYNTHETIC TEST DATA</p><h2>Run a safe scenario</h2><p>{fixtureNote}</p></div><div className="scenario-actions">{scenarios.map((scenario) => <button key={scenario.id} onClick={() => void runFixture(scenario.id)}><b>{scenario.id}</b><span>{scenario.name}</span><small>{scenario.description}</small></button>)}</div></section>
    <section className="queue"><div className="queue-head"><div><p className="eyebrow">YOUR QUEUE</p><h2>Signal review</h2></div><span className="hint">Select a team to see its evidence</span></div>{rows === undefined ? <div className="loading">Loading the live queue…</div> : <div className="table"><div className="table-row table-label"><span>TEAM</span><span>WHY NOW</span><span>RECOMMENDED RESPONSE</span><span>OWNER</span><span>STATE</span></div>{rows.map((row) => <article className="table-row clickable" key={row._id} onClick={() => setSelectedId(row._id)}><span><strong>{row.teamDisplayName}</strong><small>{label(row.route)}</small></span><span><i className={`dot ${tone(row.route)}`} />{whyNow(row.route)}</span><span><b>{row.recommendation}</b></span><span>{row.ownerId?.replace("user:", "") ?? "Unassigned"}</span><span className={`state ${row.status ?? "open"}`}>{row.status ?? "open"}</span>{(row.status ?? "open") === "open" && <div className="actions"><button onClick={(event) => { event.stopPropagation(); void decide({ candidateId: row._id as any, actorId: "user:demo-owner", decision: "not_now", reason: "Synthetic UI decision" }); }}>Not now</button><button className="primary" onClick={(event) => { event.stopPropagation(); void decide({ candidateId: row._id as any, actorId: "user:demo-owner", decision: "suppress", reason: "Synthetic UI decision" }); }}>Suppress</button></div>}</article>)}</div>}</section>
    {selectedId && <aside className="detail-backdrop" role="presentation" onClick={() => setSelectedId(null)}><section className="detail" role="dialog" aria-modal="true" aria-label="Candidate evidence" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelectedId(null)}>Close ×</button>{details === undefined ? <div className="loading">Loading evidence…</div> : details === null ? <div className="loading">This synthetic case is no longer available.</div> : <><p className="eyebrow">EVIDENCE CARD · SYNTHETIC</p><h2>{details.teamDisplayName}</h2><p className="detail-lede">{label(details.candidate.route)} · {details.candidate.recommendation}</p><div className="detail-grid"><section><h3>Why now</h3><p>{whyNow(details.candidate.route)}</p><h3>Decision owner</h3><p>{details.candidate.ownerId?.replace("user:", "") ?? "Unassigned"}</p><h3>Routing</h3><p>Policy snapshot v{details.candidate.recipientPolicyVersion}. One selected channel per recipient.</p></section><section><h3>Evidence received</h3><ul>{details.evidence.map((item, index) => <li key={`${item.sourceKind}-${index}`}><b>{item.sourceKind.replace("_", " ")}</b><span>{item.summary ?? item.completeness}</span></li>)}</ul></section></div><section className="history"><h3>Decision history</h3>{details.events.length === 0 ? <p>No decision recorded yet.</p> : <ul>{details.events.map((event, index) => <li key={`${event.eventType}-${index}`}><b>{event.eventType.replace("_", " ")}</b><span>{event.details}</span></li>)}</ul>}<h3>Delivery status</h3><ul>{details.targets.map((target, index) => <li key={`${target.recipientId}-${index}`}><b>{target.recipientId.replace("user:", "")}</b><span>{target.channel} · {target.urgent ? "urgent" : "digest"} · {target.status}</span></li>)}</ul></section></>}</section></aside>}
  </main>;
}
