import { useState } from 'react';
import { TaskChip, TaskNode, TaskRow, TaskCard } from './components/objects/task';
import { DispatchSpec } from './components/composites/DispatchSpec';
import { InteractionRequestRow } from './components/objects/interaction-request';
import { Button, Loading, Notice, SectionHeader, Switch } from './components/ui';
import { PrivacyToggle } from './components/Privacy';
import { taskFixtures } from './design-mount/taskFixtures';
import { requestFixtures } from './design-mount/requestFixtures';
import { dispatchSpecFixtures, longDispatchModel, longDispatchEffort } from './scenarioDispatchSpec';
import { bubbleHeights } from './state/activityModel';
import { scenarioName } from './scenarioMode';
import './scenarioShells.css';
import './components/TaskDetail.css';

export default function TaskObjectsFixture() {
  const { session, receipt, timeline, now } = taskFixtures;
  const [action, setAction] = useState(''), [read, setRead] = useState(false), [error, setError] = useState(false), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(false);
  const longReceipt = { ...receipt, task: { ...receipt.task, title: 'Long recorded task specification', model: longDispatchModel.model, effort: longDispatchEffort } };
  const narrow = scenarioName === 'task-objects-narrow';
  const completed = { ...session, phase: 'idle' as const, endedAt: now - 1000, readAt: read ? now : undefined };
  return <main className="shell-fixture" style={narrow ? { maxWidth: 360 } : undefined}>
    <SectionHeader level={1} title="TASK" actions={<PrivacyToggle />} />
    <output aria-label="Task action" aria-live="polite">{action}</output>
    <Switch label="Task action error" checked={error} onChange={setError} />
    <Switch label="Task busy" checked={busy} onChange={setBusy} />
    <section aria-label="Task references" className="shell-fixture-states">
      <TaskChip task={{ kind: 'activity', session, live: true }} onOpen={() => setAction('Open task reference')} selected />
      <TaskChip task={{ kind: 'receipt', record: receipt }} />
      <TaskChip task={{ kind: 'activity', session: { ...session, title: 'Unavailable task', headline: '' }, live: false }} disabled onOpen={() => setAction('Unexpected disabled task')} />
    </section>
    <section aria-label="Task nodes">
      {(['compact', 'standard', 'detailed'] as const).map(density => <div key={density} style={{ height: bubbleHeights[density], maxWidth: 304 }}><TaskNode agent="claude" session={density === 'standard' ? completed : session} now={now} density={density}
        onOpen={() => setAction(`Open ${density} node`)} onRead={() => { setRead(true); setAction('Marked task read'); }} onMove={by => setAction(`Move task ${by}`)} selected={density === 'compact'} /></div>)}
      <div style={{ height: bubbleHeights.standard, maxWidth: 304 }}><TaskNode agent="codex" session={{ ...session, interaction: requestFixtures.question }} now={now} blocking onOpen={() => setAction('Open attention')} onRead={() => {}} /></div>
    </section>
    <section aria-label="Task rows">
      <TaskRow kind="activity" agent="claude" session={session} live now={now} onOpen={() => setAction('Open conversation')} actions={<Button onClick={() => setAction('Native open')}>Native open</Button>} />
      <TaskRow kind="activity" agent="claude" session={{ ...completed, status: 'interrupted' }} live={false} now={now} onOpen={() => setAction('Open history')} />
      <TaskRow kind="receipt" record={receipt} records={[receipt]} runtime={{ runtimeStatus: 'active', observedAt: receipt.createdAt }} id="receipt" onOpen={() => setAction('Open receipt')} selected />
      <TaskRow kind="dispatch" record={receipt} runtime={{ runtimeStatus: 'waiting', observedAt: receipt.createdAt }} onOpen={() => setAction('Open dispatch')} />
      <TaskRow kind="dispatch" record={{ ...receipt, task: { ...receipt.task, title: 'Stale dispatch' } }} runtime={{ runtimeStatus: 'active', stale: true, observedAt: receipt.createdAt }} onOpen={() => setAction('Unexpected stale dispatch')} />
      <TaskRow kind="dispatch" record={{ ...receipt, state: 'failed', error: { message: 'Synthetic failure' } }} onOpen={() => setAction('Unexpected failed dispatch')} />
    </section>
    <TaskCard task={{ kind: 'timeline', session, timeline, turnId: 'older', running: false, hasPending: false, title: 'Recorded turn', source: session.dispatchSummary?.controlSource }}
      agent="dsh" agentName="dsh" onBack={() => setAction('Back')} onOpen={() => setAction('Open native')} onToggleWidth={() => { setExpanded(!expanded); setAction('Toggle width'); }} expanded={expanded} narrow={narrow} busy={busy}>
      {busy && <Loading />}{error && <Notice>Synthetic task review failure</Notice>}
      <InteractionRequestRow entry={requestFixtures.secretReceipt} />
    </TaskCard>
    <TaskCard task={{ kind: 'receipt', record: receipt, records: [receipt], runtime: { runtimeStatus: 'unknown', archived: true, observedAt: receipt.createdAt } }} agent="codex" onClose={() => setAction('Close receipt')} busy={busy} />
    <section aria-label="Long task specifications">
      <TaskRow kind="receipt" record={longReceipt} records={[longReceipt]} id="long-receipt" onOpen={() => setAction('Open long receipt')} />
      <TaskCard task={{ kind: 'receipt', record: longReceipt, records: [longReceipt] }} agent="codex" />
    </section>
    <section aria-label="Recorded dispatch specifications">{dispatchSpecFixtures.map(fixture => <section key={fixture.label} aria-label={fixture.label}><h3>{fixture.label}</h3><DispatchSpec {...fixture} /></section>)}</section>
  </main>;
}
