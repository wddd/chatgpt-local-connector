import { useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { AgentPlatformChip, AgentPlatformNode, AgentPlatformRow, AgentPlatformCard } from './components/objects/agent-platform';
import { AgentAccountChip, AgentAccountNode, AgentAccountRow, AgentAccountCard } from './components/objects/agent-account';
import { SrcAccountCard, SrcAccountChip } from './components/objects/src-account';
import { Button, IconButton, SectionHeader, Switch, Notice } from './components/ui';
import { PrivacyToggle } from './components/Privacy';
import AgentQuota from './components/AgentQuota';
import QuotaBubble from './subscriptions/QuotaBubble';
import { agentFixtures } from './design-mount/agentFixtures';
import { scenarioName } from './scenarioMode';
import './scenarioShells.css';

export default function AgentObjectsFixture() {
  const { agent, source, ingress, quotaStates } = agentFixtures;
  const [account, setAccount] = useState(agentFixtures.account), [action, setAction] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  return <main className="shell-fixture agent-objects-fixture" style={scenarioName === 'agent-objects-narrow' ? { maxWidth: 360 } : undefined}>
    <SectionHeader level={1} title="AGENT objects" actions={<PrivacyToggle />} />
    <output aria-label="Agent object action" aria-live="polite">{action}</output>
    <Switch label="Busy profiles" checked={busy} onChange={setBusy} /><Switch label="Retained read error" checked={error} onChange={setError} />
    <section aria-label="Control icons" className="flex gap-2">
      <IconButton icon={RefreshCw} label="Refresh fixture" onClick={() => setAction('Refreshed')} />
      <IconButton icon={ExternalLink} size={20} label="Open fixture" onClick={() => setAction('Opened')} />
    </section>
    <section aria-label="Agent references" className="shell-fixture-states">
      <AgentPlatformChip agent={agent} onOpen={() => setAction('Platform opened')} />
      <AgentPlatformChip agent={{ agent: 'unknown-agent' }} />
      <AgentAccountChip account={account} agent={agent.agent} onOpen={() => setAction('Agent account opened')} />
      <SrcAccountChip source={source} account={account} onOpen={() => setAction('Source account opened')} />
    </section>
    <section aria-label="Agent rows">
      <AgentPlatformRow agent={{ ...agent, adapter: { state: 'failed', error: 'Synthetic adapter failure' } }} onOpen={() => setAction('Failed platform opened')} />
      <AgentPlatformRow agent={{ agent: 'codex', installed: false }} disabled onOpen={() => setAction('Unexpected disabled action')} />
      <AgentAccountRow agent={agent.agent} account={account} onOpen={() => setAction('Agent account row opened')} />
    </section>
    <AgentAccountRow account={{ ...account, alias: 'Invalid profile', agentProfiles: [{ ...account.agentProfiles[0], state: 'invalid' }] }} agent={agent.agent} />
    <AgentAccountRow account={{ ...account, alias: 'Unfinished profile', agentProfiles: [{ ...account.agentProfiles[0], state: 'unfinished' }] }} agent={agent.agent} />
    <AgentPlatformCard agent={agent} frame="catalog" onOpen={() => setAction('Catalog detail opened')} onLink={() => setAction('Official link opened')} headerActions={<Switch label="Enable fixture agent" checked={!busy} onChange={value => setBusy(!value)} />} />
    <AgentPlatformCard agent={agent} error={error ? 'Synthetic retained read failure' : undefined}><AgentAccountRow account={account} agent={agent.agent} onOpen={() => setAction('L2 opened')} /></AgentPlatformCard>
    <AgentPlatformCard agent={{ ...agent, adapter: { state: 'failed', error: 'CLAUDE_ADAPTER_PROBE_FAILED' } }} />
    <section aria-label="Profile inspector">
      <AgentAccountCard account={account} agent={agent} busy={busy} loading={busy} error={error ? 'Synthetic retained read failure' : undefined}
        onDefault={profile => { setAction(`Default: ${profile.profileId}`); setAccount(old => ({ ...old, agentProfiles: old.agentProfiles.map(item => ({ ...item, default: item.profileId === profile.profileId })) })); }}
        onReauth={profile => setAction(`Reauth: ${profile.profileId}`)}>
        <AgentQuota provider={quotaStates.ready} refreshing={busy} onRefresh={() => setAction('Quota refresh')} />
      </AgentAccountCard>
    </section>
    <section aria-label="Source authorization">
      <SrcAccountCard account={account} source={source} ingress={ingress} ingresses={[ingress]} onAuthorization={(_connection, request) => setAction(`Authorization: ${request}`)} />
    </section>
    <section aria-label="Agent nodes" className="shell-fixture-states">
      <AgentPlatformNode agent={agent} quota={null} state="normal" selected onOpen={() => setAction('Platform node')} onMove={by => setAction(`Move: ${by}`)} />
      <AgentAccountNode account={account} agent={agent.agent} state="normal" flat onOpen={() => setAction('Account node')} />
      <AgentAccountNode account={{ ...account, quota: { ...account.quota, windows: [] } }} agent={agent.agent} state="error" onOpen={() => setAction('Empty quota node')} />
    </section>
    <section aria-label="Quota states">{Object.entries(quotaStates).map(([state, provider]) => <section key={state} aria-label={`Quota ${state}`}><SectionHeader level={2} title={state} /><QuotaBubble provider={provider} />{provider.error && <Notice>{provider.error.message}</Notice>}</section>)}</section>
    <AgentAccountCard account={{ ...account, agentProfiles: [], email: undefined, orgName: undefined, plan: undefined }} loading error="Synthetic identity read failure" footer={<Button disabled>Unavailable account action</Button>} />
  </main>;
}
