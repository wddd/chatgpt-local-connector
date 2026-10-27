import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ViewStack, Button, Empty, EntityCard, FactList, Loading, SectionHeader, DialogClose, IconButton, Notice, StateBadge } from './ui';
import { SrcAccountRow } from './objects/src-account';
import { SrcPlatformChip } from './objects/src-platform';
import { statePresentation } from './objects/statePresentation';
import { t } from '../i18n';
import { isLocalSource, sourceDate } from '../sourcePresentation';
import { accountsApi } from '../api';
import { connector } from '../state/connector';
import { useAccounts, refreshAccounts } from '../state/accounts';
import { ingressPanel, selectSourcePanel } from '../state/overviewPanels';
import { openOnboarding } from '../state/onboarding';
import { PrivacyToggle } from './Privacy';
import { AccountActions } from './composites/AccountActions';
import SourceConversations from './SourceConversations';

export default function SourcePanel({ product, accountId, widthControl }: { product: string; accountId?: string; widthControl?: ReactNode }) {
  const content = useRef<HTMLDivElement>(null), previous = useRef(accountId);
  useLayoutEffect(() => {
    if (previous.current !== accountId) {
      const id = accountId ? undefined : previous.current;
      requestAnimationFrame(() => {
        const row = id && content.current?.querySelector<HTMLElement>(`[data-hover-target="${CSS.escape(id)}"]`);
        (row || content.current?.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true });
      });
    }
    previous.current = accountId;
  }, [accountId]);
  const { sources } = connector.use(), state = useAccounts();
  const entries = sources.filter(source => source.product === product && !isLocalSource(source));
  const accounts = state.items.filter(account => !account.removedAt && account.sources.some(id => entries.some(source => source.id === id)));
  const account = accounts.find(account => account.id === accountId);
  const owned = entries.filter(source => account?.sources.includes(source.id));
  const lastSeen = Math.max(0, ...owned.map(source => source.lastSeenAt ?? 0));
  return <div ref={content} className="flex h-full min-h-0 flex-col">
    <SectionHeader className="dialog-header flex shrink-0 items-center gap-2 border-b px-4 py-3 [&_.section-header-copy]:min-w-0 [&_.section-header-copy]:flex-1 [&_h2]:truncate" level={2}
      leading={accountId && <IconButton icon={ArrowLeft} label={t('back')} onClick={() => selectSourcePanel(product, { platformOnly: true })} />}
      title={account?.alias ?? <SrcPlatformChip product={product} />} titleProps={{ tabIndex: -1 }}
      actions={<><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t('close')} /></DialogClose></>} />
    <ViewStack hidden={!accountId} className="side-panel-scroll gap-4 overflow-auto p-4">
      {state.error && <Notice>{state.error}</Notice>}
      {state.loading && <Loading />}
      {account ? <>
        <EntityCard headerActions={<StateBadge presentation={statePresentation('account', account.health.state)} />}>
          <FactList missing={{ placeholder: '—' }} items={[{ label: t('source.lastSeen'), value: sourceDate(lastSeen) }]} />
          {[...new Set(owned.map(source => source.state))].map(value => <StateBadge key={value} presentation={statePresentation('source', value)} />)}
        </EntityCard>
        <SourceConversations key={account.id} accountId={account.id} />
        <AccountActions alias={account.alias} onRename={async alias => { await accountsApi.update({ id: account.id, alias }); await refreshAccounts(); }}
          onRemove={async () => { await accountsApi.remove({ id: account.id, running: 'finish' }); await refreshAccounts(); ingressPanel.set({ product }); }} />
      </> : !state.loading && <Notice>{t('accounts.identityUnavailable')}</Notice>}
    </ViewStack>
    <ViewStack hidden={!!accountId} className="side-panel-scroll gap-4 overflow-auto p-4">
        {state.error && <Notice>{state.error}</Notice>}
        {state.loading && <Loading />}
        <Button onClick={() => openOnboarding('product', { source: product })}>{t('accounts.add')}</Button>
        {accounts.map(account => <SrcAccountRow key={account.id} account={account} sources={entries.filter(source => account.sources.includes(source.id))} source={entries.find(source => account.sources.includes(source.id))!}
          onOpen={() => selectSourcePanel(product, { accountId: account.id })} />)}
        {!state.loading && !accounts.length && <Empty>{t('panels.noAccounts')}</Empty>}
    </ViewStack>
  </div>;
}
