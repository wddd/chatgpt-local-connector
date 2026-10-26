import { useReducedMotion } from "../state/appEnvironment";
import { agentPanel, selectAgentPanel } from "../state/overviewPanels";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Settings, Maximize2, Minimize2, X } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { useAccounts } from "../state/accounts";
import { agentActivity } from "../state/activity";
import { compactAgentVersion, name, type Agent } from "../state/agents";
import { connector } from "../state/connector";
import { AgentQuotaIcon } from "../subscriptions/QuotaRing";
import { Button, Dialog, DialogClose, HoverScope, IconButton, Notice, Status } from "./ui";
import AgentConversations from "./AgentConversations";
import ActivityTimeline from "./ActivityTimeline";
import AgentBehavior from "./AgentBehavior";
import AgentAccount from "./AgentAccount";
import AccountMaintenance from "./AccountMaintenance";
import { AccountQuota } from "./AccountCards";
import AddAccount from "./AddAccount";
import DispatchPolicy from "./DispatchPolicy";
import { PrivacyToggle } from "./Privacy";
import { openSourceWorkspace } from "./SourcePanel";
import { controlSource } from "../controlSources";
import type { SurfaceRect } from "../motion/surface";
import type { ProviderAccount } from "../types";
import { accountOwns } from "../accountPresentation";

function AgentView({ agent, account, accountId, accounts, onSettings, expanded, onToggleWidth, active, resizable = true }: {
  agent: Agent; active: boolean; resizable?: boolean; account?: ProviderAccount; accountId?: string; accounts: ProviderAccount[];
  onSettings: () => void; expanded: boolean; onToggleWidth: () => void;
}) {
  const { status, sources } = connector.use();
  const activity = agentActivity.use().snapshot;
  const [error, setError] = useState(""), [adding, setAdding] = useState(false);
  const title = account?.alias ?? name(agent);
  const sessions = activity?.agents[agent.agent]?.sessions.filter(session => !accountId || (account
    ? accountOwns(account, session.agentAccountId ?? session.dispatchSummary?.agentAccountId)
    : (session.agentAccountId ?? session.dispatchSummary?.agentAccountId) === accountId)) ?? [];
  const linked = sources.filter(source => account?.sources.includes(source.id));
  const back = () => selectAgentPanel({ type: "platform", agent: agent.agent });
  return <section className="agent-panel-layer agent-overview-layer">
    <header className="dialog-header agent-panel-header">
      <div className="actions">{accountId && <IconButton icon={ArrowLeft} label={t("back")} onClick={back} />}
      <AgentQuotaIcon agent={agent.agent} quota={accountId ? account?.quota ?? null : undefined} dual /></div>
      <div className="agent-panel-heading">
        <div className="agent-panel-title-row">
          <h2 className="activity-panel-title" tabIndex={-1} title={title}>{title}</h2>
          {agent.installed && status?.platform && status.platform !== "linux" && <IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
            setError(""); void api("agents/open", "POST", { agent: agent.agent }).catch(error => setError(String(error)));
          }} />}
        </div>
        <span className="activity-panel-meta" title={agent.version || undefined}>{[compactAgentVersion(agent.version), t("agentPanel.inProgress", { count: sessions.length })].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="actions">
        {accountId && <PrivacyToggle />}
        <IconButton icon={Settings} label={t("agentDisplaySettings")} onClick={onSettings} />
        {resizable && <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")} aria-pressed={expanded} onClick={onToggleWidth} />}
        <DialogClose asChild><IconButton icon={X} label={t("close")} /></DialogClose>
      </div>
    </header>
    <div className="agent-view-scroll">
      {error && <Notice>{error}</Notice>}
      {accountId ? account ? <AccountMaintenance account={account} onRemoved={back}>
        <AccountQuota account={account} agent={agent.agent} />
        <AgentAccount account={account} agent={agent.agent} />
        {linked.map(source => <Button key={source.id} variant="link" onClick={() => openSourceWorkspace(source.id)}>{controlSource(source.product)?.displayName ?? source.product} · {account.alias}{linked.length > 1 ? ` · ${source.label}` : ""}</Button>)}
        <AgentConversations agent={agent.agent} account={account} accountId={accountId} active={active} />
      </AccountMaintenance> : <Notice>{t("accounts.identityUnavailable")}</Notice> : <>
        <AgentBehavior agent={agent.agent} />
        <DispatchPolicy agent={agent.agent} />
        <section className="account-card">
          <div className="source-section-heading"><h3>{t("accounts.title")}</h3><Button onClick={() => setAdding(true)}>{t("accounts.add")}</Button></div>
          <HoverScope>{accounts.filter(account => account.agentProfiles.some(profile => profile.agent === agent.agent)).map(account => {
            const profile = account.agentProfiles.find(profile => profile.agent === agent.agent)!;
            return <Button key={account.id} data-agent-account={account.id} data-hover-target={account.id} variant="ghost" className="account-list-row" onClick={() => selectAgentPanel({ type: "agent", agent: agent.agent, accountId: account.id })}>
              <AgentQuotaIcon agent={agent.agent} quota={account.quota} /><span className="account-row-copy"><strong>{account.alias}</strong></span><Status tone={profile.state === "signed-in" ? "success" : "warning"}>{t(`accounts.profile.${profile.state}`)}</Status>
            </Button>;
          })}</HoverScope>
        </section>
        <AgentConversations agent={agent.agent} active={active} />
      </>}
    </div>
    {adding && <AddAccount initialKind={agent.agent === "claude" || agent.agent === "codex" ? agent.agent : "api-key"} onClose={() => setAdding(false)} />}
  </section>;
}

export default function AgentPanel({ agent, onSettings, onPanelFrame, width, expanded, onToggleWidth, dockRect }: {
  agent: Agent; width?: number; dockRect?: SurfaceRect;
  onSettings: () => void; onPanelFrame: (rect: SurfaceRect | null) => void;
  expanded: boolean; onToggleWidth: () => void;
}) {
  const selected = agentPanel.use()!, { error } = agentActivity.use();
  const accountState = useAccounts(), account = accountState.items.find(account => accountOwns(account, selected.accountId));
  const reduced = useReducedMotion(), previous = useRef(selected), content = useRef<HTMLDivElement>(null);
  const session = selected.session, taskTitleId = useId();
  useLayoutEffect(() => {
    const prior = previous.current;
    if (prior.agent === selected.agent && (prior.session && !session || prior.accountId && !selected.accountId)) {
      requestAnimationFrame(() => {
        const row = prior.session ? Array.from(content.current?.querySelectorAll<HTMLButtonElement>("[data-activity-session]") ?? []).find(node => node.dataset.activitySession === JSON.stringify([selected.agent, prior.session!.id]) && !node.closest('[hidden]'))
          : content.current?.querySelector<HTMLElement>(`[data-agent-account="${CSS.escape(prior.accountId!)}"]`);
        (row ?? content.current?.querySelector<HTMLElement>(".agent-overview-layer h2"))?.focus({ preventScroll: true });
      });
    }
    previous.current = selected;
  }, [selected, session]);
  const viewProps = { agent, accounts: accountState.items, resizable: !dockRect, onSettings, expanded, onToggleWidth };
  return <Dialog width={width} dockRect={dockRect} dock="right" expanded={expanded} headerless title={account?.alias ?? name(agent)} labelledBy={session ? taskTitleId : undefined}
    originKey={`${agent.agent}:${selected.accountId ?? ""}`} closeRequested={selected.closing}
    onBack={session || selected.accountId ? () => selectAgentPanel({ type: "back" }) : undefined}
    onCloseStart={() => agentPanel.set(old => old?.agent === agent.agent && old.accountId === selected.accountId ? { ...old, closing: true } : old)}
    onClose={() => { const current = agentPanel.get(); if (current?.agent === agent.agent && current.accountId === selected.accountId && current.closing) selectAgentPanel({ type: "closed" }); }}
    returnFocus={`[data-agent-node="${CSS.escape(agent.agent)}"]${selected.accountId ? `[data-account-id="${CSS.escape(account?.id ?? selected.accountId)}"]` : ""} button, [data-agent-node="${CSS.escape(agent.agent)}"] button`} onPanelFrame={onPanelFrame}>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}{accountState.error && <Notice>{accountState.error}</Notice>}
    <div ref={content} className="agent-panel-view">
      <motion.div className="agent-panel-view" key={`${agent.agent}:platform`} hidden={!!session || !!selected.accountId} style={{ display: session || selected.accountId ? "none" : "flex" }} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView {...viewProps} active={!session && !selected.accountId} />
      </motion.div>
      {selected.accountId && <motion.div className="agent-panel-view" key={`${agent.agent}:${selected.accountId}`} hidden={!!session} style={{ display: session ? "none" : "flex" }} initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView {...viewProps} account={account} accountId={selected.accountId} active={!session} />
      </motion.div>}
      {session && <motion.div className="agent-panel-view" key={`${agent.agent}:${session.id}`} initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <ActivityTimeline resizable={!dockRect} titleId={taskTitleId} agent={agent.agent} session={session} expanded={expanded} onToggleWidth={onToggleWidth} onBack={() => selectAgentPanel({ type: "back" })} />
      </motion.div>}
    </div>
  </Dialog>;
}
