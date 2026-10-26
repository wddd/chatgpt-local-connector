import { useState } from 'react';
import { Button, Dialog, SectionHeader, Switch, SingleChoice } from './components/ui';
import { InteractionRequestCard, InteractionRequestChip, InteractionRequestRow } from './components/objects/interaction-request';
import { AuthorizationRequestCard, AuthorizationRequestChip, AuthorizationRequestRow } from './components/objects/authorization-request';
import { DeploymentProgressCard } from './components/objects/deployment-progress';
import { RelayMemberCard, RelayMemberRow } from './components/objects/relay-member';
import type { ApprovalSubmission } from './state/activityModel';
import type { RemoteProfile } from './controlSources';
import { setPrivacy } from './state/privacy';
import { scenarioName } from './scenarioMode';
import { requestFixtures as f } from './design-mount/requestFixtures';
import './scenarioShells.css';

export default function RequestsFixture() {
  const [index, setIndex] = useState(0), [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [state, setState] = useState('pending'), [receipt, setReceipt] = useState('');
  const [open, setOpen] = useState(false), [privacy, updatePrivacy] = useState(true);
  const [label, setLabel] = useState('Sample source'), [source, setSource] = useState('new'), [profile, setProfile] = useState<RemoteProfile>('legacy');
  const [account, setAccount] = useState('');
  const submission: ApprovalSubmission | undefined = state === 'pending' ? undefined : { status: state as ApprovalSubmission['status'], decision: 'answer', payload: { op: 'codex_respond', args: {} }, error: 'Sample response failed' };
  const card = <InteractionRequestCard interaction={index ? f.permission : f.question} submission={submission} answers={answers} onAnswersChange={setAnswers} onRespond={decision => setReceipt(`Responded: ${decision}`)} pager={{ index, count: 2, onChange: setIndex }} />;
  return <main className="shell-fixture" style={scenarioName === 'requests-narrow' ? { maxWidth: 360 } : undefined}>
    <SectionHeader level={1} title="Requests and relay" />
    <Switch label="Privacy" checked={privacy} onChange={value => { updatePrivacy(value); setPrivacy(value); }} />
    <SingleChoice label="Submission state" value={state} onChange={setState} options={['pending', 'submitting', 'submitted', 'failed', 'unconfirmed'].map(value => ({ value, label: value }))} />
    <InteractionRequestChip interaction={f.question} onOpen={() => setOpen(true)} />
    <Button onClick={() => setOpen(true)}>Open request sheet</Button>
    {card}
    <InteractionRequestRow entry={f.secretReceipt} />
    {open && <Dialog sheet title="Request sheet" onClose={() => setOpen(false)}>{card}</Dialog>}
    <AuthorizationRequestChip request={f.authorization} />
    <AuthorizationRequestRow request={f.authorization} onOpen={() => setReceipt('Review authorization')} />
    <AuthorizationRequestCard request={f.authorization} ingress={f.ingress} sourceId={source} onSourceChange={setSource} label={label} onLabelChange={setLabel} profile={profile} onProfileChange={setProfile} candidates={[]} remaining={[]} onDecide={allow => setReceipt(allow ? 'Authorization allowed' : 'Authorization denied')} error={state === 'failed' ? 'Sample authorization failure' : undefined} />
    <DeploymentProgressCard progress={f.deployment} busy={false} account={account} setAccount={setAccount} onRetry={() => setReceipt('Retry deployment')} onCancel={() => setReceipt('Cancel deployment')} />
    <RelayMemberRow member={f.member} now={f.now} onRemove={() => setReceipt('Review removal')} />
    <RelayMemberRow member={{ ...f.member, isSelf: true }} deviceName="Self device" now={f.now} onRemove={() => setReceipt('Unexpected self removal')} />
    <RelayMemberCard member={f.member} now={f.now} />
    <output aria-live="polite">{receipt}</output>
  </main>;
}
