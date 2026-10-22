import { agentPanel, selectAgentPanel } from "../state/overviewPanels";
import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Settings, Maximize2, Minimize2 } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { agentActivity } from "../state/activity";
import { subscriptions } from "../state/subscriptions";
import { name, type Agent } from "../state/agents";
import { connector } from "../state/connector";
import { AgentQuotaIcon } from "../subscriptions/QuotaRing";
import QuotaBubble from "../subscriptions/QuotaBubble";
import { Dialog, IconButton } from "./ui";
import AgentConversations from "./AgentConversations";
import ActivityTimeline from "./ActivityTimeline";
import type { SurfaceRect } from "../motion/surface";

function AgentView({ agent, state, onSettings, expanded, onToggleWidth, active }: {
  agent: Agent; state: string; active: boolean;
  onSettings: () => void; expanded: boolean; onToggleWidth: () => void;
}) {
  const { snapshot } = subscriptions.use(), { status } = connector.use();
  const [error, setError] = useState("");
  const provider = snapshot?.settings.enabled ? snapshot.providers.find(p => p.agentIds.includes(agent.agent) && p.eligible) : undefined;
  return <section className="agent-panel-layer agent-overview-layer">
    <header className="dialog-header">
      <AgentQuotaIcon agent={agent.agent} />
      <h2 className="activity-panel-title" tabIndex={-1}>{name(agent)}</h2>
      <div className="actions">
        {agent.installed && status?.platform && status.platform !== "linux" && <IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
          setError(""); void api("agents/open", "POST", { agent: agent.agent }).catch(error => setError(String(error)));
        }} />}
        <IconButton icon={Settings} label={t("settings")} onClick={onSettings} />
        <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")}
          aria-pressed={expanded} onClick={onToggleWidth} />
      </div>
      <div className="activity-panel-subline"><span className="activity-panel-meta">{[agent.version, t(state)].filter(Boolean).join(" · ")}</span></div>
    </header>
    <div className="agent-view-scroll">
      {error && <p className="timeline-error" role="alert">{error}</p>}
      {provider ? <QuotaBubble provider={provider} /> : <p className="timeline-meta">{t("agentPanel.noQuota")}</p>}
      <AgentConversations key={agent.agent} agent={agent.agent} active={active} />
    </div>
  </section>;
}

export default function AgentPanel({ agent, state, onSettings, onPanelFrame, expanded, onToggleWidth }: {
  agent: Agent; state: string;
  onSettings: () => void; onPanelFrame: (rect: SurfaceRect | null) => void;
  expanded: boolean; onToggleWidth: () => void;
}) {
  const selected = agentPanel.use()!, { error } = agentActivity.use();
  const reduced = useReducedMotion(), previous = useRef(selected), content = useRef<HTMLDivElement>(null);
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
  return <Dialog width={400} dock="right" expanded={expanded} headerless title={name(agent)}
    originKey={agent.agent} closeRequested={selected.closing} onClose={() => selectAgentPanel({ type: "closed" })}
    returnFocus={`[data-agent-node="${CSS.escape(agent.agent)}"] button`} onPanelFrame={onPanelFrame}>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
    <div ref={content} className="agent-panel-view">
      <motion.div className="agent-panel-view" key={agent.agent} style={{ display: session ? "none" : "flex" }}
        initial={{ opacity: reduced ? 1 : 0, x: 0 }} animate={{ opacity: session ? 0 : 1, x: reduced || !session ? 0 : -12 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView agent={agent} state={state} active={!session} onSettings={onSettings} expanded={expanded} onToggleWidth={onToggleWidth} />
      </motion.div>
      {session && <motion.div className="agent-panel-view" key={`${agent.agent}:${session.id}`}
        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <ActivityTimeline agent={agent.agent} session={session} expanded={expanded} onToggleWidth={onToggleWidth} onBack={() => selectAgentPanel({ type: "back" })} />
      </motion.div>}
    </div>
  </Dialog>;
}
