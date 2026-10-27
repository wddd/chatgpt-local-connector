import { useState } from 'react';
import { Button, Dialog, SectionHeader, Switch, SingleChoice } from './components/ui';
import { InteractionRequestCard, InteractionRequestChip, InteractionRequestRow } from './components/objects/interaction-request';
import { AuthorizationRequestCard, AuthorizationRequestChip, AuthorizationRequestRow } from './components/objects/authorization-request';
import { DeploymentProgressCard } from './components/objects/deployment-progress';
import type { ApprovalSubmission } from './state/activityModel';
import type { RelayProgress } from './state/relay';
import { setPrivacy } from './state/privacy';
import { scenarioName } from './scenarioMode';
import { requestFixtures as f } from './design-mount/requestFixtures';
import './scenarioShells.css';
import './scenarioRequests.css';

export default function RequestsFixture() {
  const [index, setIndex] = useState(0), [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [state, setState] = useState('pending'), [receipt, setReceipt] = useState('');
  const [open, setOpen] = useState(false), [privacy, updatePrivacy] = useState(true);
  const [label, setLabel] = useState('Sample source'), [source, setSource] = useState('new');
  const [account, setAccount] = useState('');
  const [authorization, setAuthorization] = useState('pending'), [deployment, setDeployment] = useState('account');
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const progress: RelayProgress = deployment === 'account' ? f.deployment : deployment === 'cancelled' ? { phase: 'failed', cancelled: true } : deployment === 'failed' ? { phase: 'failed', failedPhase: 'connecting', reason: 'Connection failed' } : { phase: deployment as RelayProgress['phase'], action: 'create', ...(deployment === 'login' ? { loginUrl: 'https://login.example.test/private' } : {}), ...(deployment === 'ready' ? { result: { ingressId: 'fixture-ingress', url: 'https://private.example.test/mcp' } } : {}) };
  const submission: ApprovalSubmission | undefined = state === 'pending' ? undefined : { status: state as ApprovalSubmission['status'], decision: 'answer', payload: { op: 'codex_respond', args: {} }, error: 'Sample response failed' };
  const card = <InteractionRequestCard interaction={index ? f.permission : f.question} submission={submission} answers={answers} onAnswersChange={setAnswers} onRespond={decision => setReceipt(`Responded: ${decision}`)} pager={{ index, count: 2, onChange: setIndex }} />;
  return <main className="shell-fixture requests-fixture" style={scenarioName === 'requests-narrow' ? { maxWidth: 360 } : undefined}>
    <SectionHeader level={1} title="Requests and relay" />
    <Switch label="Privacy" checked={privacy} onChange={value => { updatePrivacy(value); setPrivacy(value); }} />
    <SingleChoice label="Submission state" value={state} onChange={setState} options={['pending', 'submitting', 'submitted', 'failed', 'unconfirmed'].map(value => ({ value, label: value }))} />
    <InteractionRequestChip interaction={f.question} onOpen={() => setOpen(true)} />
    <Button onClick={() => setOpen(true)}>Open request sheet</Button>
    {card}
    <InteractionRequestRow entry={f.secretReceipt} />
    {open && <Dialog sheet title="Request sheet" onClose={() => setOpen(false)}>{card}</Dialog>}
    <SingleChoice label="Authorization state" value={authorization} onChange={setAuthorization} options={['pending', 'switch', 'approved', 'denied', 'expired'].map(value => ({ value, label: value }))} />
    <Switch label="Authorization busy" checked={authorizationBusy} onChange={setAuthorizationBusy} />
    <AuthorizationRequestChip request={f.authorization} />
    <AuthorizationRequestRow request={f.authorization} onOpen={() => setReceipt('Review authorization')} />
    <AuthorizationRequestCard busy={authorizationBusy} request={{ ...f.authorization, status: authorization === 'switch' ? 'pending' : authorization, switchSourceId: authorization === 'switch' ? 'removed-source' : undefined }} ingress={f.ingress} sourceId={source} onSourceChange={setSource} label={label} onLabelChange={setLabel} candidates={[]} remaining={[]} onDecide={allow => setReceipt(allow ? 'Authorization allowed' : 'Authorization denied')} error={state === 'failed' ? 'Sample authorization failure' : undefined} />
    <SingleChoice label="Deployment state" value={deployment} onChange={setDeployment} options={['account', 'login', 'deploying', 'connecting', 'ready', 'failed', 'cancelled'].map(value => ({ value, label: value }))} />
    <DeploymentProgressCard progress={progress} busy={false} account={account} setAccount={setAccount} onRetry={() => setReceipt('Retry deployment')} onCancel={() => setReceipt('Cancel deployment')} />
    <output aria-live="polite">{receipt}</output>
  </main>;
}
