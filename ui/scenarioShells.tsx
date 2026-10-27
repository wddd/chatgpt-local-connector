import { useState } from 'react';
import { ArrowLeft, Maximize2, X } from 'lucide-react';
import { AddressField, HoverPreviewGroup, Button, EntityCard, EntityRow, FactList, Freshness, IconButton, Notice, PlatformIcon, SectionHeader, StateBadge, Switch } from './components/ui';
import { Sensitive } from './components/Sensitive';
import { PrivacyToggle } from './components/Privacy';
import { statePresentation } from './components/objects/statePresentation';
import { maskSensitive } from './privacyMask';
import { t } from './i18n';
import { compactAge } from './subscriptions/presentation';
import './scenarioShells.css';

/** Real shells with synthetic values and observable, local-only callbacks. */
export default function ShellFixture() {
  const [selected, setSelected] = useState(false), [busy, setBusy] = useState(false), [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false), [action, setAction] = useState(''), [error, setError] = useState(false);
  const now = Date.parse('2026-01-01T12:00:00Z'), observedAt = '2026-01-01T11:58:00Z';
  const address = 'https://relay.example.test/mcp';
  return <main className="shell-fixture">
    <SectionHeader level={1} title="Shells" actions={<PrivacyToggle />} />
    <SectionHeader level={2} title="PlatformIcon" />
    <div className="shell-fixture-icons">{(['source', 'agent', 'provider'] as const).map(role => <div key={role}>
      <PlatformIcon role={role} platform={role === 'source' ? 'claude' : 'codex'} size={32} />
      <PlatformIcon role={role} platform="unknown-brand" size={32} />
      <PlatformIcon role={role} platform="unknown-brand" size={32} add />
    </div>)}</div>
    <SectionHeader level={2} title="StateBadge" />
    <div className="shell-fixture-states">{(['running', 'needsYou', 'done', 'failed', 'interrupted', 'unrecognized'] as const).map(state =>
      <StateBadge key={state} presentation={statePresentation('task', state)} />)}
      <StateBadge variant="compact" presentation={statePresentation('permission', 'missing')} />
      <StateBadge variant="dot" presentation={statePresentation('member', 'offline')} />
    </div>
    <EntityCard icon={<PlatformIcon role="source" platform="chatgpt" size={24} />} title="EntityCard" headerActions={<Button onClick={() => setAction('Edit')}>{t('edit')}</Button>}
      footer={<Freshness observedAt={observedAt} age={compactAge(observedAt, now)} stale onRefresh={() => { setBusy(!busy); setAction('Refresh'); }} busy={busy} refreshLabel={t('usageRefresh')} />}
      danger={<Button variant="danger-outline" onClick={() => setAction('Remove requested')}>{t('remove')}</Button>}>
      <SectionHeader level={3} title="SectionHeader" count={2}
        back={<IconButton icon={ArrowLeft} label={t('back')} onClick={() => setAction('Back')} />}
        widthControl={<IconButton icon={Maximize2} label={t('expandPanelWidth')} onClick={() => setAction('Width')} />}
        close={<IconButton icon={X} label={t('close')} onClick={() => setAction('Close')} />} />
      <EntityRow leading={<PlatformIcon role="agent" platform="codex" size={24} />} title="EntityRow" secondary={<Sensitive>sample@example.test</Sensitive>}
        selected={selected} onClick={() => { setSelected(!selected); setAction('Selected'); }} state={<StateBadge presentation={statePresentation('task', 'failed')} />}
        actions={<Button onClick={() => setAction('Independent action')}>{t('edit')}</Button>} chevron />
      <EntityRow title="Disabled row" disabled onClick={() => setAction('Unexpected disabled action')} state={<StateBadge presentation={statePresentation('connection', 'disabled')} />} />
      <FactList missing={{ placeholder: '—' }} items={[
        { label: 'Platform', value: 'Codex' }, { label: 'Identity', value: <Sensitive>sample@example.test</Sensitive> },
        { label: 'Version' }, { label: 'Documentation', value: <a href="#shell-actions">Local fixture actions</a> },
      ]} />
      <AddressField value={address} label="AddressField" display={<Sensitive>{revealed ? address : maskSensitive(address, true)}</Sensitive>}
        revealed={revealed} onReveal={() => setRevealed(!revealed)} onCopy={() => { setCopied(!error); setAction(error ? 'Copy failed' : 'Copy requested'); }}
        copied={copied} error={error ? t('copyFailedSelectAndCopyTheTextManually') : undefined} />
      <AddressField value="" label="Missing address" display="" onCopy={() => setAction('Unexpected missing copy')} placeholder="—" />
      <Freshness age="" unknown={t('oauthTimeUnknown')} />
      <Switch label="Copy error" checked={error} onChange={setError} />
      {error && <Notice>{t('copyFailedSelectAndCopyTheTextManually')}</Notice>}
    </EntityCard>
    <SectionHeader level={2} title="Shared hover preview" />
    <HoverPreviewGroup className="flex gap-2" preview={key => key === 'short' ? 'Short preview' : 'A longer preview keeps the same floating surface mounted while its contents resize.'}>
      <Button data-hover-target="short">Short preview target</Button>
      <Button data-hover-target="long">Long preview target</Button>
    </HoverPreviewGroup>
    <output id="shell-actions" aria-live="polite">{action}</output>
  </main>;
}
