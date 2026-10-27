import { AgentPlatformCard } from './objects/agent-platform';
import { AgentAccountCard, AgentAccountRow } from './objects/agent-account';
import { SrcAccountChip } from './objects/src-account';
import { openSourceWorkspace } from './SourcePanel';
import AddAccount from './AddAccount';
import { navigation } from '../state/navigation';
import { ViewStack, Dialog, IconButton, Notice, Button } from "./ui";
import { useReducedMotion } from "../state/appEnvironment";
import { agentPanel, selectAgentPanel } from "../state/overviewPanels";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Settings, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { api, accountsApi } from "../api";
import { t } from "../i18n";
import { useAccounts, refreshAccounts } from "../state/accounts";
import { accountQuotaProvider } from "../subscriptions/accountQuota";
import AgentQuota from "./AgentQuota";
import { agentActivity } from "../state/activity";
import { refreshSubscription, subscriptions } from "../state/subscriptions";
import { compactAgentVersion, name, type Agent } from "../state/agents";
import { connector } from "../state/connector";
import { errorLabels } from "../subscriptions/presentation";
import AgentConversations from "./AgentConversations";
import ActivityTimeline from "./ActivityTimeline";
import type { SurfaceRect } from "../motion/surface";
import type { AccountLogin, ProviderAccount } from "../types";
import { accountOwns } from "../accountPresentation";

function AgentView({ agent, account, accountId, accounts, onSettings, expanded, onToggleWidth, active, resizable = true }: {
  agent: Agent; active: boolean; resizable?: boolean; account?: ProviderAccount; accountId?: string; accounts: ProviderAccount[];
  onSettings: () => void; expanded: boolean; onToggleWidth: () => void;
}) {
  const { snapshot } = subscriptions.use(), { status, sources } = connector.use();
  const activity = agentActivity.use().snapshot;
  const [error, setError] = useState(""), [refreshing, setRefreshing] = useState(false);
  const provider = accountId ? account ? accountQuotaProvider(agent.agent, account.quota) : undefined
    : snapshot?.settings.enabled ? snapshot.providers.find(p => p.agentIds.includes(agent.agent) && p.eligible) : undefined;
  const [login, setLogin] = useState<AccountLogin>(), [busy, setBusy] = useState(false);
  async function mutate(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); await refreshAccounts(); } catch (error) { setError(String(error)); } finally { setBusy(false); } }
  const sessions = activity?.agents[agent.agent]?.sessions.filter(session => !accountId || (account
    ? accountOwns(account, session.agentAccountId ?? session.dispatchSummary?.agentAccountId)
    : (session.agentAccountId ?? session.dispatchSummary?.agentAccountId) === accountId)) ?? [];
  const providerError = provider?.error && !["no-subscription", "no-limits-reported", "unsupported-platform"].includes(provider.error.code)
    ? provider.error.message || t(errorLabels[provider.error.code] || "usageUnavailable") : undefined;
  async function refresh() {
    if (!provider) return;
    setRefreshing(true); setError("");
    try { if (accountId) await refreshAccounts(); else await refreshSubscription(provider.providerId); }
    catch (error) { setError(String(error)); }
    finally { setRefreshing(false); }
  }
  const titleActions = agent.installed && status?.platform && status.platform !== "linux" && <IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
    setError(""); void api("agents/open", "POST", { agent: agent.agent }).catch(error => setError(String(error)));
  }} />;
  const secondary = <span className="activity-panel-meta" title={agent.version || undefined}>{[compactAgentVersion(agent.version), t("agentPanel.inProgress", { count: sessions.length })].filter(Boolean).join(" · ")}</span>;
  const headerActions = <><IconButton icon={Settings} label={t("agentDisplaySettings")} onClick={onSettings} />
    {resizable && <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")} aria-pressed={expanded} onClick={onToggleWidth} />}</>;
  const body = <>
      {error && <p className="timeline-error" role="alert">{error}</p>}
      {providerError && <Notice action={<IconButton icon={RefreshCw} size={16} label={t("usageRefresh")}
        busy={refreshing || provider?.refreshing} onClick={() => void refresh()} />}>{providerError}</Notice>}
      {provider ? <AgentQuota provider={provider} onRefresh={() => void refresh()} refreshing={refreshing} /> : <p className="timeline-meta agent-no-quota">{t("agentPanel.noQuota")}</p>}
      <AgentConversations key={`${agent.agent}:${accountId ?? ""}`} agent={agent.agent} account={account} accountId={accountId} active={active} />
  </>;
  return <section className="agent-panel-layer agent-overview-layer">
    {account ? <AgentAccountCard account={account} agent={agent} frame="panel" titleActions={titleActions} secondary={secondary} headerActions={headerActions} busy={busy}
      onDefault={profile => void mutate(() => accountsApi.update({ id: account.id, defaultFor: profile.agent, profileId: profile.profileId }))}
      onReauth={profile => void mutate(async () => setLogin(await accountsApi.reauth({ id: account.id, agent: profile.agent, profileId: profile.profileId })))}>
      {sources.filter(source => account.sources.includes(source.id)).map(source => <SrcAccountChip key={source.id} source={source} account={account} onOpen={() => { selectAgentPanel({ type: 'closed' }); openSourceWorkspace(source.id); }} />)}
      <Button variant="link" onClick={() => { selectAgentPanel({ type: 'closed' }); navigation.set(old => ({ ...old, page: 'accounts', accountId: account.id })); }}>{t('accounts.openAccount')}</Button>
      {body}
    </AgentAccountCard> : <AgentPlatformCard agent={agent} frame="panel" quota={accountId ? null : undefined} titleActions={titleActions} secondary={secondary} headerActions={headerActions}>
      {accountId ? <Notice>{t('accounts.identityUnavailable')}</Notice> : accounts.filter(item => item.agentProfiles.some(profile => profile.agent === agent.agent)).map(item => <AgentAccountRow key={item.id} account={item} agent={agent.agent} onOpen={() => selectAgentPanel({ type: 'agent', agent: agent.agent, accountId: item.id })} />)}{body}
    </AgentPlatformCard>}
    {login && <AddAccount initialLogin={login} onClose={() => setLogin(undefined)} />}
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
  const returning = previous.current.agent === selected.agent && previous.current.accountId === selected.accountId && !!previous.current.session && !session;
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
  return <Dialog width={width} dockRect={dockRect} dock="right" expanded={expanded} headerless title={account?.alias ?? name(agent)} labelledBy={session ? taskTitleId : undefined}
    originKey={`${agent.agent}:${selected.accountId ?? ""}`} closeRequested={selected.closing}
    onCloseStart={() => agentPanel.set(old => old?.agent === agent.agent && old.accountId === selected.accountId ? { ...old, closing: true } : old)}
    onClose={() => { const current = agentPanel.get(); if (current?.agent === agent.agent && current.accountId === selected.accountId && current.closing) selectAgentPanel({ type: "closed" }); }}
    returnFocus={`[data-agent-node="${CSS.escape(agent.agent)}"]${selected.accountId ? `[data-account-id="${CSS.escape(account?.id ?? selected.accountId)}"]` : ""} button`} onPanelFrame={onPanelFrame}>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
    <ViewStack ref={content}>
      <ViewStack asChild hidden={!!session}><motion.div key={`${agent.agent}:${selected.accountId ?? ""}`}
        initial={{ opacity: reduced ? 1 : 0, x: 0 }} animate={{ opacity: session ? 0 : 1, x: reduced || !session ? 0 : -12 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView resizable={!dockRect} agent={agent} account={account} accounts={accountState.items} accountId={selected.accountId} active={!session} onSettings={onSettings} expanded={expanded} onToggleWidth={onToggleWidth} />
      </motion.div></ViewStack>
      {session && <ViewStack asChild><motion.div key={`${agent.agent}:${session.id}`}
        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <ActivityTimeline resizable={!dockRect} titleId={taskTitleId} agent={agent.agent} session={session} expanded={expanded} onToggleWidth={onToggleWidth} onBack={() => selectAgentPanel({ type: "back" })} />
      </motion.div></ViewStack>}
    </ViewStack>
  </Dialog>;
}
