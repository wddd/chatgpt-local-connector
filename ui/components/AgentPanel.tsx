import { agentPanel, selectAgentPanel } from "../state/overviewPanels";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Settings, X } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { activityHistory, agentActivity } from "../state/activity";
import { orderActivity, type TrackedActivity } from "../state/activityModel";
import { taskOrder } from "../state/taskOrder";
import { subscriptions } from "../state/subscriptions";
import { name, type Agent } from "../state/agents";
import { connector } from "../state/connector";
import { AgentQuotaIcon } from "../subscriptions/QuotaRing";
import QuotaBubble from "../subscriptions/QuotaBubble";
import { Dialog, IconButton, SingleChoice } from "./ui";
import { ActivityBubble } from "./ActivityBubbles";
import ActivityTimeline from "./ActivityTimeline";
import type { SurfaceRect } from "../motion/surface";
import type { AgentTimeline } from "../types";

function AgentView({ agent, state, sessions, now, onSettings, onClose, tab, setTab }: {
  agent: Agent; state: string; sessions: TrackedActivity[]; now: number;
  onSettings: () => void; onClose: () => void; tab: string; setTab: (tab: string) => void;
}) {
  const { snapshot } = subscriptions.use(), { status } = connector.use();
  const history = activityHistory.use(), manualOrder = taskOrder.use();
  const [error, setError] = useState("");
  const [ended, setEnded] = useState<TrackedActivity[]>([]);
  const provider = snapshot?.settings.enabled ? snapshot.providers.find(p => p.agentIds.includes(agent.agent) && p.eligible) : undefined;
  const active = orderActivity(sessions.filter(s => s.endedAt === undefined), manualOrder[agent.agent] ?? []);
  const candidates = history[agent.agent] ?? [];
  useEffect(() => {
    let stopped = false;
    if (!candidates.length) { setEnded([]); return; }
    // Existing timeline reads establish that a retained ARC session is still obtainable.
    void Promise.all(candidates.map(async session => {
      try {
        await api<AgentTimeline>(`agents/timeline/${encodeURIComponent(session.id)}`);
        return session;
      } catch { return undefined; }
    })).then(values => {
      if (!stopped) setEnded(values.filter((s): s is TrackedActivity => !!s).sort((a, b) => b.endedAt! - a.endedAt!));
    });
    return () => { stopped = true; };
  }, [agent.agent, candidates.map(s => `${s.id}:${s.endedAt}`).join(",")]);
  const rows = tab === "ended" ? ended : active;
  return <section className="agent-panel-layer agent-overview-layer">
    <header className="dialog-header">
      <AgentQuotaIcon agent={agent.agent} />
      <h2 className="activity-panel-title" tabIndex={-1}>{name(agent)}</h2>
      <div className="actions">
        {agent.installed && status?.platform && status.platform !== "linux" && <IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
          setError(""); void api("agents/open", "POST", { agent: agent.agent }).catch(error => setError(String(error)));
        }} />}
        <IconButton icon={Settings} label={t("settings")} onClick={onSettings} />
        <IconButton icon={X} label={t("close")} onClick={onClose} />
      </div>
      <div className="activity-panel-subline"><span className="activity-panel-meta">{[agent.version, t(state)].filter(Boolean).join(" · ")}</span></div>
    </header>
    <div className="agent-view-scroll">
      {error && <p className="timeline-error" role="alert">{error}</p>}
      {provider ? <QuotaBubble provider={provider} /> : <p className="timeline-meta">{t("agentPanel.noQuota")}</p>}
      <SingleChoice value={tab} onChange={setTab} label={t("tasks")} options={[
        { value: "active", label: t("agentPanel.active", { count: active.length }) },
        { value: "ended", label: t("agentPanel.ended") },
      ]} />
      <div className="activity-task-list">
        {rows.map(session => <ActivityBubble key={session.id} agent={agent.agent} session={session} now={now} listRow />)}
        {!rows.length && <p className="timeline-meta">{t(tab === "ended" ? "agentPanel.noEnded" : "agentPanel.noActive")}</p>}
      </div>
    </div>
  </section>;
}

export default function AgentPanel({ agent, state, sessions, now, onSettings, onPanelFrame }: {
  agent: Agent; state: string; sessions: TrackedActivity[]; now: number;
  onSettings: () => void; onPanelFrame: (rect: SurfaceRect | null) => void;
}) {
  const selected = agentPanel.use()!, { error } = agentActivity.use();
  const reduced = useReducedMotion(), previous = useRef(selected), content = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("active");
  useEffect(() => { setTab("active"); }, [agent.agent]);
  const session = selected.session;
  const returning = previous.current.agent === selected.agent && !!previous.current.session && !session;
  useLayoutEffect(() => {
    if (returning) {
      const id = previous.current.session!.id;
      requestAnimationFrame(() => {
        const row = Array.from(content.current?.querySelectorAll<HTMLButtonElement>("[data-activity-session]") ?? [])
          .find(node => node.dataset.activitySession === JSON.stringify([selected.agent, id]));
        (row ?? content.current?.querySelector<HTMLElement>(".agent-overview-layer h2"))?.focus({ preventScroll: true });
      });
    }
    previous.current = selected;
  }, [selected]);
  const close = () => selectAgentPanel({ type: "dismiss" });
  return <Dialog width={400} dock="right" headerless title={name(agent)}
    originKey={agent.agent} closeRequested={selected.closing} onClose={() => selectAgentPanel({ type: "closed" })}
    returnFocus={`[data-agent-node="${CSS.escape(agent.agent)}"] button`} onPanelFrame={onPanelFrame}>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
    <div ref={content} className="agent-panel-view">
      <motion.div className="agent-panel-view" key={agent.agent} style={{ display: session ? "none" : "flex" }}
        initial={{ opacity: reduced ? 1 : 0, x: 0 }} animate={{ opacity: session ? 0 : 1, x: reduced || !session ? 0 : -12 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView agent={agent} state={state} sessions={sessions} now={now} tab={tab} setTab={setTab} onSettings={onSettings} onClose={close} />
      </motion.div>
      {session && <motion.div className="agent-panel-view" key={`${agent.agent}:${session.id}`}
        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <ActivityTimeline agent={agent.agent} session={session} onClose={close} onBack={() => selectAgentPanel({ type: "back" })} />
      </motion.div>}
    </div>
  </Dialog>;
}
