import { AgentPlatformCard } from './objects/agent-platform';
import { AgentAccountCard, AgentAccountRow } from './objects/agent-account';
import { AccountActions } from './composites/AccountActions';
import { statePresentation } from './objects/statePresentation';
import AddAccount from './AddAccount';
import { ViewStack, Dialog, DialogClose, IconButton, Notice, Button, Empty, StateBadge, Loading } from './ui';
import { useReducedMotion } from '../state/appEnvironment';
import { agentPanel, selectAgentPanel } from '../state/overviewPanels';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, X, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { accountsApi } from '../api';
import { t } from '../i18n';
import { useAccounts, refreshAccounts } from '../state/accounts';
import { accountQuotaProvider } from '../subscriptions/accountQuota';
import AgentQuota from './AgentQuota';
import { agentActivity } from '../state/activity';
import { compactAgentVersion, name, type Agent } from '../state/agents';
import { errorLabels } from '../subscriptions/presentation';
import AgentConversations from './AgentConversations';
import ActivityTimeline from './ActivityTimeline';
import type { SurfaceRect } from '../motion/surface';
import type { AccountLogin, ProviderAccount } from '../types';
import { accountOwns } from '../accountPresentation';

function AgentView({ agent, account, accountId, accounts, loading, accountError, expanded, onToggleWidth, active, resizable = true }: {
  agent: Agent; active: boolean; resizable?: boolean; account?: ProviderAccount; accountId?: string; accounts: ProviderAccount[]; loading: boolean; accountError: string;
  expanded: boolean; onToggleWidth: () => void;
}) {
  const [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false);
  const [login, setLogin] = useState<AccountLogin>(), [busy, setBusy] = useState(false);
  const provider = account ? accountQuotaProvider(agent.agent, account.quota) : undefined;
  const providerError = provider?.error && !['no-subscription', 'no-limits-reported', 'unsupported-platform'].includes(provider.error.code)
    ? provider.error.message || t(errorLabels[provider.error.code] || 'usageUnavailable') : undefined;
  async function refresh() {
    setRefreshing(true);
    try { await refreshAccounts(); } finally { setRefreshing(false); }
  }
  async function add() {
    setBusy(true); setError('');
    try { setLogin(await accountsApi.add({ kind: agent.agent === 'claude' || agent.agent === 'codex' ? agent.agent : 'api-key' })); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  const headerActions = <>
    {resizable && <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? 'restorePanelWidth' : 'expandPanelWidth')} aria-pressed={expanded} onClick={onToggleWidth} />}
    <DialogClose asChild><IconButton icon={X} label={t('close')} /></DialogClose>
  </>;
  const back = <IconButton icon={ArrowLeft} label={t('back')} onClick={() => selectAgentPanel({ type: 'back' })} />;
  return <section className="agent-overview-layer flex h-full min-h-0 w-full flex-col">
    {account ? <AgentAccountCard account={account} agent={agent} frame="panel" icon={back} showProfiles={false}
      secondary={<StateBadge presentation={statePresentation('account', account.health.state)} />} headerActions={headerActions}>
      {[...new Set(account.agentProfiles.filter(profile => profile.agent === agent.agent).map(profile => profile.state))].map(state => <StateBadge key={state} presentation={statePresentation('profile', state)} />)}
      {providerError && <Notice action={<IconButton icon={RefreshCw} label={t('usageRefresh')} busy={refreshing} onClick={() => void refresh()} />}>{providerError}</Notice>}
      {provider ? <AgentQuota provider={provider} onRefresh={() => void refresh()} refreshing={refreshing} /> : <p className="text-xs text-muted-foreground">{t('agentPanel.noQuota')}</p>}
      <AgentConversations key={`${agent.agent}:${account.id}`} agent={agent.agent} account={account} accountId={account.id} active={active} />
      <AccountActions alias={account.alias} onRename={async alias => { await accountsApi.update({ id: account.id, alias }); await refreshAccounts(); }}
        onRemove={async () => { await accountsApi.remove({ id: account.id, running: 'finish' }); await refreshAccounts(); agentPanel.set({ agent: agent.agent }); }} />
    </AgentAccountCard> : <AgentPlatformCard agent={agent} frame="panel" quota={null}
      titleActions={accountId ? back : undefined} secondary={<span title={agent.version ?? undefined}>{compactAgentVersion(agent.version)}</span>} headerActions={headerActions}>
      {loading && <Loading />}
      {accountError && <Notice>{accountError}</Notice>}
      {accountId ? <Notice>{t('accounts.identityUnavailable')}</Notice> : <>
        <Button busy={busy} onClick={() => void add()}>{t('accounts.add')}</Button>
        {accounts.filter(item => !item.removedAt && item.agentProfiles.some(profile => profile.agent === agent.agent)).map(item => <AgentAccountRow key={item.id} account={item} agent={agent.agent} onOpen={() => selectAgentPanel({ type: 'agent', agent: agent.agent, accountId: item.id })} />)}
        {!loading && !accounts.some(item => !item.removedAt && item.agentProfiles.some(profile => profile.agent === agent.agent)) && <Empty>{t('panels.noAccounts')}</Empty>}
      </>}
    </AgentPlatformCard>}
    {error && <Notice>{error}</Notice>}
    {login && <AddAccount initialLogin={login} onClose={() => setLogin(undefined)} />}
  </section>;
}

export default function AgentPanel({ agent, onPanelFrame, width, expanded, onToggleWidth, dockRect }: {
  agent: Agent; width?: number; dockRect?: SurfaceRect;
  onPanelFrame: (rect: SurfaceRect | null) => void;
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
        (row ?? [...(content.current?.querySelectorAll<HTMLElement>('.agent-overview-layer h2') ?? [])].find(node => !node.closest('[hidden]')))?.focus({ preventScroll: true });
      });
    }
    if (!returning && previous.current.accountId !== selected.accountId) {
      const id = selected.accountId ? undefined : previous.current.accountId;
      requestAnimationFrame(() => {
        const row = id && content.current?.querySelector<HTMLElement>(`[data-hover-target="${CSS.escape(id)}"]`);
        (row || [...(content.current?.querySelectorAll<HTMLElement>('h2') ?? [])].find(node => !node.closest('[hidden]')))?.focus({ preventScroll: true });
      });
    }
    previous.current = selected;
  }, [selected]);
  return <Dialog width={width} dockRect={dockRect} dock="right" expanded={expanded} headerless title={account?.alias ?? name(agent)} labelledBy={session ? taskTitleId : undefined}
    onBack={session || selected.accountId ? () => selectAgentPanel({ type: "back" }) : undefined}
    originKey={agent.agent} closeRequested={selected.closing}
    onCloseStart={() => agentPanel.set(old => old?.agent === agent.agent && old.accountId === selected.accountId ? { ...old, closing: true } : old)}
    onClose={() => { const current = agentPanel.get(); if (current?.agent === agent.agent && current.accountId === selected.accountId && current.closing) selectAgentPanel({ type: "closed" }); }}
    returnFocus={`[data-agent-node="${CSS.escape(agent.agent)}"]${selected.accountId ? `[data-account-id="${CSS.escape(account?.id ?? selected.accountId)}"]` : ""} button`} onPanelFrame={onPanelFrame}>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
    <ViewStack ref={content}>
      <ViewStack hidden={!!session || !!selected.accountId}>
        <AgentView key={agent.agent} resizable={!dockRect} agent={agent} accounts={accountState.items} loading={accountState.loading} accountError={accountState.error} active={!session && !selected.accountId} expanded={expanded} onToggleWidth={onToggleWidth} />
      </ViewStack>
      {selected.accountId && <ViewStack asChild hidden={!!session}><motion.div key={`${agent.agent}:${selected.accountId}`}
        initial={{ opacity: reduced ? 1 : 0, x: 0 }} animate={{ opacity: session ? 0 : 1, x: reduced || !session ? 0 : -12 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <AgentView resizable={!dockRect} agent={agent} account={account} accounts={accountState.items} loading={accountState.loading} accountError={accountState.error} accountId={selected.accountId} active={!session} expanded={expanded} onToggleWidth={onToggleWidth} />
      </motion.div></ViewStack>}
      {session && <ViewStack asChild><motion.div key={`${agent.agent}:${session.id}`}
        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <ActivityTimeline resizable={!dockRect} titleId={taskTitleId} agent={agent.agent} session={session} expanded={expanded} onToggleWidth={onToggleWidth} onBack={() => selectAgentPanel({ type: "back" })} />
      </motion.div></ViewStack>}
    </ViewStack>
  </Dialog>;
}
