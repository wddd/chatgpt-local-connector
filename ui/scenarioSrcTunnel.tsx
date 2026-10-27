import { useMemo, useState } from 'react';
import { SrcPlatformChip, SrcPlatformNode, SrcPlatformRow, SrcPlatformCard } from './components/objects/src-platform';
import { SrcAccountChip, SrcAccountNode, SrcAccountRow, SrcAccountCard } from './components/objects/src-account';
import { TunnelChip, TunnelNode, TunnelRow, TunnelCard } from './components/objects/tunnel';
import { Button, EntityCard, Notice, SectionHeader, SingleChoice, Switch } from './components/ui';
import { PrivacyToggle } from './components/Privacy';
import { fixtures } from './design-mount/fixtures';
import type { ControlSource, Ingress } from './state/types';
import type { ProviderAccount } from './types';
import { solve } from './topology/solve';
import { solvePortrait } from './topology/portrait';
import type { PaintNode } from './topology/render';
import { scenarioName } from './scenarioMode';
import './scenarioShells.css';

const ingress: Ingress = { ...fixtures.ingresses[0], id: 'object-tunnel', name: 'Design connection', transport: 'https', url: 'https://private.example.test/mcp', state: 'ready', auth: 'oauth', oauth: { pending: [], grants: [] } };
const source: ControlSource = { ...fixtures.sources[0], id: 'object-source', ingressId: ingress.id, product: 'claude', label: 'Primary source', state: 'connected', connectedAt: 1767225600, lastSeenAt: 1767225600 };
const second: ControlSource = { ...source, id: 'second-source', label: 'Second source', state: 'disconnected', pendingSwitch: { ingressId: 'other-tunnel', expiresAt: 1767225900, requestId: 'latest-authorization' } };
const account: ProviderAccount = { ...fixtures.accounts[0], id: 'object-account', alias: 'Shared account', sources: [source.id, second.id], email: 'private@example.test', orgName: 'Private organization', plan: 'Pro', sourceIdentities: {} };
const authorization = { id: 'latest-authorization', sourceId: second.id, status: 'denied', clientName: 'Design client', redirectUri: '', resource: '' };

export default function SrcTunnelFixture() {
  const [action, setAction] = useState(''), [selected, setSelected] = useState<string>(), [readError, setReadError] = useState(false), [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState('claude');
  const frame = useMemo(() => {
    const scene = { vw: 600, vh: 360, left: [{ id: 'wire', tasks: [], children: [{ id: 'child', tasks: [] }] }], right: [] };
    const nodes: PaintNode[] = [{ id: 'wire', side: -1, state: 'error', selected: true, attention: false }, { id: 'child', parent: 'wire', side: -1, state: 'connecting', selected: false, attention: true }];
    return { landscape: { layout: solve(scene), nodes, tasks: [] }, portrait: { layout: solvePortrait(scene), nodes, tasks: [] } };
  }, []);
  const active = [source, second].find(entry => entry.id === selected);
  const openConnection = (id: string) => setAction(`Connection: ${id}`);
  return <main className="shell-fixture src-tunnel-fixture" style={scenarioName === 'src-tunnel-narrow' ? { maxWidth: 360 } : undefined}>
    <SectionHeader level={1} title="SRC and TUNNEL" actions={<PrivacyToggle />} />
    <output aria-label="Object action" aria-live="polite">{action}</output>
    <section aria-label="References" className="shell-fixture-states">
      <SrcPlatformChip product="claude" onOpen={() => setAction('Platform: claude')} sources={[source]} />
      <SrcPlatformChip product="unknown-product" />
      <SrcAccountChip source={source} account={account} onOpen={() => setAction('Account: object-account')} />
      <SrcAccountChip provenance={{ kind: 'retired-client', label: 'Historical source' }} />
      <TunnelChip ingress={ingress} onOpen={() => openConnection(ingress.id)} />
      <TunnelChip missingName="Removed connection" onOpen={() => setAction('Unexpected removed connection')} />
    </section>
    <section aria-label="Source rows">
      <SrcAccountRow source={source} account={account} ingress={ingress} onOpen={() => setAction('Source: object-source')} onConnection={openConnection} />
      <SrcAccountRow source={{ ...source, label: 'Revoked source', state: 'revoked' }} selected attention disabled onOpen={() => setAction('Unexpected disabled action')} />
      <SrcAccountRow source={{ ...source, label: 'Missing identity', ingressId: 'gone' }} onOpen={() => setAction('Missing identity opened')} />
    </section>
    <SrcPlatformCard product="claude" sources={[source, second]} accounts={[account]} ingresses={[ingress]} onSource={entry => setAction(`Source: ${entry.id}`)} onConnection={openConnection} onAdd={() => setAction('Add: claude')} onLink={url => setAction(`Link: ${url}`)} />
    <SrcPlatformCard product="unknown-product" sources={[]} accounts={[]} ingresses={[]} error="Synthetic platform read failure" />
    <EntityCard title="Shared account inspector">
      <section aria-label="Mutation targets">{[source, second].map(entry => <SrcAccountRow key={entry.id} source={entry} selected={entry.id === selected} onOpen={() => setSelected(entry.id)} />)}</section>
      {active ? <SrcAccountCard source={active} account={account} ingress={ingress} ingresses={[{ ...ingress, id: second.pendingSwitch!.ingressId, oauth: { pending: [authorization], grants: [] } }]} onConnection={openConnection}
        headerActions={<Button disabled={busy} onClick={() => setAction(`Change: ${active.id}`)}>Change connection</Button>}
        danger={<Button variant="danger-outline" disabled={busy} onClick={() => setAction(`Disconnect: ${active.id}`)}>Disconnect</Button>} /> : <Notice tone="warning">Select a source for mutations.</Notice>}
    </EntityCard>
    <SrcAccountCard source={second} account={{ ...account, sourceIdentities: { [second.id]: { state: 'conflict' } } }} ingress={ingress} ingresses={[{ ...ingress, id: second.pendingSwitch!.ingressId, oauth: { pending: [authorization], grants: [] } }]} onConnection={openConnection} error={readError ? 'Synthetic refresh failure' : undefined} loading={busy} />
    <SrcAccountCard source={{ ...source, label: 'Awaiting identity', connectedAt: null, lastSeenAt: null }} loading />
    <Switch label="Refresh error" checked={readError} onChange={setReadError} /><Switch label="Busy" checked={busy} onChange={setBusy} />
    <section aria-label="Connection rows">
      <TunnelRow ingress={ingress} sources={[source, second]} onOpen={() => openConnection(ingress.id)} />
      <TunnelRow ingress={{ ...ingress, name: 'Failed connection', state: 'error', error: 'Synthetic transport failure' }} sources={[source]} selected disabled />
      <TunnelRow ingress={{ ...ingress, name: 'Starting connection', state: 'starting', url: '' }} sources={[]} />
    </section>
    <TunnelCard ingress={ingress} sources={[source, second]} busy={busy} error={readError ? 'Synthetic refresh failure' : undefined} />
    <TunnelCard ingress={{ ...ingress, name: 'Missing address', url: '', state: 'error', error: 'Synthetic transport failure' }} sources={[]} />
    <section aria-label="Product choices" className="object-choice">
      <SingleChoice cards label="Product" value={choice} onChange={setChoice} options={['claude', 'chatgpt'].map(product => ({ value: product, label: product, content: <SrcPlatformRow product={product} /> }))} />
    </section>
    <section aria-label="Source nodes" className="shell-fixture-states">
      <SrcPlatformNode product="claude" state="normal" selected onOpen={() => setAction('Platform node')} onMove={by => setAction(`Move: ${by}`)} />
      <SrcAccountNode product="claude" account={account} state="error" flat onOpen={() => setAction('Account node')} />
    </section>
    <section aria-label="Landscape wires" className="src-tunnel-wires"><TunnelNode frame={frame.landscape} /></section>
    <section aria-label="Portrait wires" className="src-tunnel-wires"><TunnelNode frame={frame.portrait} orientation="portrait" /></section>
  </main>;
}
