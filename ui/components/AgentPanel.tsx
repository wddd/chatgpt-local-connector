import { agentPanel, selectAgentPanel } from "../state/overviewPanels";
import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Settings, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { locale, t } from "../i18n";
import { api } from "../api";
import { agentActivity } from "../state/activity";
import { refreshSubscription, subscriptions } from "../state/subscriptions";
import { useNow } from "../state/hooks";
import { compactAgentVersion, name, type Agent } from "../state/agents";
import { connector } from "../state/connector";
import { AgentQuotaIcon, agentQuotaWindows } from "../subscriptions/QuotaRing";
import { quotaDisplay, quotaLabel, quotaPercent, quotaValue, resetDisplay } from "../subscriptions/displayPreferences";
import { isWeekly, windowLabel } from "../subscriptions/labels";
import { compactAge, compactReset, errorLabels, preciseTime, quotaColor } from "../subscriptions/presentation";
import { quotaPace } from "../subscriptions/pace";
import type { ProviderSnapshot } from "../subscriptions/types";
import { Button, Dialog, IconButton, Notice } from "./ui";
import UsageHistory from "../subscriptions/UsageHistory";
import ResetCreditDetails from "../subscriptions/ResetCreditDetails";
import AgentConversations from "./AgentConversations";
import ActivityTimeline from "./ActivityTimeline";
import type { SurfaceRect } from "../motion/surface";

function AgentQuota({ provider, onRefresh, refreshing }: { provider: ProviderSnapshot; onRefresh: () => void; refreshing: boolean }) {
  const now = useNow();
  locale.use();
  const display = quotaDisplay.use(), reset = resetDisplay.use();
  const { short, weekly } = agentQuotaWindows(provider);
  const selected = [short, weekly].filter(window => window !== undefined);
  const windows = selected.length ? selected : provider.windows.filter(window => Number.isFinite(window.usedPercent)).slice(0, 2);
  const pace = windows.map(window => quotaPace(window, provider, now));
  const warning = pace.find(value => value?.label);
  const observed = Date.parse(provider.observedAt ?? "");
  const age = compactAge(provider.observedAt, now);
  const summaryWindow = weekly ?? windows[0];
  if (!windows.length) return <p className="timeline-meta agent-no-quota">{t("agentPanel.noQuota")}</p>;
  return <section className="agent-quota-block" aria-label={t("agentQuotaGroup")}>
    <div className="agent-quota-cards">
      {windows.map((window, index) => {
        const resetAt = Date.parse(window.resetsAt ?? "");
        const elapsed = isWeekly(window.label) && Number.isFinite(resetAt)
          ? Math.max(0, Math.min(1, (now - resetAt + 7 * 86400000) / (7 * 86400000))) : undefined;
        const tick = elapsed === undefined ? undefined : (display === "remaining" ? 1 - elapsed : elapsed) * 100;
        const label = windowLabel(window.label), value = quotaValue(window);
        const resetText = reset === "time" && Number.isFinite(resetAt) ? preciseTime(window.resetsAt) : compactReset(window.resetsAt, now);
        return <div className="agent-quota-card" key={window.id}>
          <div className="agent-quota-window"><span title={window.scope}>{label}</span>
            <time dateTime={Number.isFinite(resetAt) ? window.resetsAt : undefined}
              title={Number.isFinite(resetAt) ? t("quotaResetAt", { time: preciseTime(window.resetsAt) }) : t("quotaResetUnknown")}
              aria-label={t(reset === "time" ? "quotaResetAt" : "quotaResetIn", { time: resetText })}>{resetText}</time>
            {window === summaryWindow && <span className="agent-quota-refresh">
              <time dateTime={Number.isFinite(observed) ? provider.observedAt : undefined}
                title={Number.isFinite(observed) ? preciseTime(provider.observedAt) : undefined}
                aria-label={t("agentPanel.updated", { time: age })}>{age}</time>
              <IconButton icon={RefreshCw} size={16} label={t("usageRefresh")} busy={refreshing || provider.refreshing}
                disabled={!provider.eligible} onClick={onRefresh} />
            </span>}
          </div>
          <div className="agent-quota-balance">
            <strong className="agent-quota-percent" aria-label={`${label} · ${quotaLabel()} ${quotaPercent(window)}`}>{quotaPercent(window)}</strong>
            {window === summaryWindow && <div className="agent-quota-extras">
              {Number.isFinite(provider.creditBalance) && <span>{Math.ceil(provider.creditBalance!)} credits</span>}
              {provider.availableResetCount != null && <UsageHistory detail={() => <ResetCreditDetails credits={provider.resetCredits} now={now} />}>
                {({ register, hover, focus, expanded }) => <Button variant="ghost" className="agent-quota-resets"
                  ref={node => register("resets", node)}
                  onPointerEnter={event => event.pointerType !== "touch" && hover("resets")}
                  onPointerLeave={event => event.pointerType !== "touch" && hover("")}
                  onClick={() => focus("resets")} onFocus={() => focus("resets")} onBlur={() => focus("")}
                  aria-expanded={expanded}>
                  {provider.availableResetCount} {provider.availableResetCount === 1 ? "reset" : "resets"}
                </Button>}
              </UsageHistory>}
            </div>}
          </div>
          <div className="agent-quota-track" role="meter" aria-label={`${label} · ${quotaLabel()}`}
            title={pace[index]?.tooltip}
            aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${value}%`, background: pace[index]?.color ?? quotaColor(window, provider, now) }} />
            {tick !== undefined && <span className="agent-quota-pace-marker" role="img" aria-label={t("quotaTimeTick")}
              title={t("quotaTimeTick")} style={{ left: `clamp(1px, ${tick}%, calc(100% - 1px))` }} />}
          </div>
        </div>;
      })}
    </div>
    {warning?.label && <span className="agent-quota-warning" title={warning.tooltip}>{warning.label}</span>}
  </section>;
}

function AgentView({ agent, onSettings, expanded, onToggleWidth, active }: {
  agent: Agent; active: boolean;
  onSettings: () => void; expanded: boolean; onToggleWidth: () => void;
}) {
  const { snapshot } = subscriptions.use(), { status } = connector.use();
  const activity = agentActivity.use().snapshot;
  const [error, setError] = useState(""), [refreshing, setRefreshing] = useState(false);
  const provider = snapshot?.settings.enabled ? snapshot.providers.find(p => p.agentIds.includes(agent.agent) && p.eligible) : undefined;
  const providerError = provider?.error && !["no-subscription", "no-limits-reported", "unsupported-platform"].includes(provider.error.code)
    ? provider.error.message || t(errorLabels[provider.error.code] || "usageUnavailable") : undefined;
  async function refresh() {
    if (!provider) return;
    setRefreshing(true); setError("");
    try { await refreshSubscription(provider.providerId); }
    catch (error) { setError(String(error)); }
    finally { setRefreshing(false); }
  }
  return <section className="agent-panel-layer agent-overview-layer">
    <header className="dialog-header agent-panel-header">
      <AgentQuotaIcon agent={agent.agent} dual />
      <div className="agent-panel-heading">
        <div className="agent-panel-title-row">
          <h2 className="activity-panel-title" tabIndex={-1} title={name(agent)}>{name(agent)}</h2>
          {agent.installed && status?.platform && status.platform !== "linux" && <IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
            setError(""); void api("agents/open", "POST", { agent: agent.agent }).catch(error => setError(String(error)));
          }} />}
        </div>
        <span className="activity-panel-meta" title={agent.version || undefined}>{[compactAgentVersion(agent.version), t("agentPanel.inProgress", { count: activity?.agents[agent.agent]?.sessions.length ?? 0 })].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="actions">
        <IconButton icon={Settings} label={t("agentDisplaySettings")} onClick={onSettings} />
        <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")}
          aria-pressed={expanded} onClick={onToggleWidth} />
      </div>
    </header>
    <div className="agent-view-scroll">
      {error && <p className="timeline-error" role="alert">{error}</p>}
      {providerError && <Notice action={<IconButton icon={RefreshCw} size={16} label={t("usageRefresh")}
        busy={refreshing || provider?.refreshing} onClick={() => void refresh()} />}>{providerError}</Notice>}
      {provider ? <AgentQuota provider={provider} onRefresh={() => void refresh()} refreshing={refreshing} /> : <p className="timeline-meta agent-no-quota">{t("agentPanel.noQuota")}</p>}
      <AgentConversations key={agent.agent} agent={agent.agent} active={active} />
    </div>
  </section>;
}

export default function AgentPanel({ agent, onSettings, onPanelFrame, width, expanded, onToggleWidth }: {
  agent: Agent; width?: number;
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
  return <Dialog width={width} dock="right" expanded={expanded} headerless title={name(agent)}
    originKey={agent.agent} closeRequested={selected.closing}
    onCloseStart={() => agentPanel.set(old => old?.agent === agent.agent ? { ...old, closing: true } : old)}
    onClose={() => { if (agentPanel.get()?.agent === agent.agent && agentPanel.get()?.closing) selectAgentPanel({ type: "closed" }); }}
    returnFocus={`[data-agent-node="${CSS.escape(agent.agent)}"] button`} onPanelFrame={onPanelFrame}>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
    <div ref={content} className="agent-panel-view">
      <motion.div className="agent-panel-view" key={agent.agent} style={{ display: session ? "none" : "flex" }}
        initial={{ opacity: reduced ? 1 : 0, x: 0 }} animate={{ opacity: session ? 0 : 1, x: reduced || !session ? 0 : -12 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView agent={agent} active={!session} onSettings={onSettings} expanded={expanded} onToggleWidth={onToggleWidth} />
      </motion.div>
      {session && <motion.div className="agent-panel-view" key={`${agent.agent}:${session.id}`}
        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <ActivityTimeline agent={agent.agent} session={session} expanded={expanded} onToggleWidth={onToggleWidth} onBack={() => selectAgentPanel({ type: "back" })} />
      </motion.div>}
    </div>
  </Dialog>;
}
