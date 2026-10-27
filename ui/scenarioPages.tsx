import { useState } from 'react';
import { pageFixture } from './scenarios';
import QuotaBubble from './subscriptions/QuotaBubble';
import { subscriptions } from './state/subscriptions';
import { accounts } from './state/accounts';
import { Button } from './components/ui';
import AgentsSettings from './components/AgentsSettings';
import AgentDisplaySettings from './components/AgentDisplaySettings';
import AddAccount from './components/AddAccount';
import MergeAccounts from './components/MergeAccounts';
import OAuthGrants from './components/OAuthGrants';
import RelayHosting from './components/RelayHosting';
import './scenarioShells.css';
import ManagementTableFixture from './scenarioManagement';

export default function PagesFixture() {
  const [open, setOpen] = useState(true), [busy, setBusy] = useState(false);
  const state = accounts.use(), quota = subscriptions.use().snapshot?.providers[0];
  const close = () => setOpen(false);
  return <main className="shell-fixture">
    {!open && <Button onClick={() => setOpen(true)}>Reopen fixture</Button>}
    {open && <>
      {pageFixture === 'management-table' && <ManagementTableFixture />}
      {pageFixture === 'agents-settings' && <AgentsSettings onClose={close} />}
      {pageFixture === 'agent-display-settings' && <AgentDisplaySettings onClose={close} />}
      {pageFixture === 'add-account' && <AddAccount onClose={close} initialLogin={state.login ?? undefined} />}
      {pageFixture === 'merge-accounts' && <MergeAccounts account={state.items.find(account => account.id === 'account-claude')!} onClose={close} />}
      {pageFixture === 'oauth-grants' && <OAuthGrants ingressId="relay-main" running onBusy={setBusy} />}
      {pageFixture === 'quota-segments' && quota && <QuotaBubble provider={quota} />}
      {pageFixture === 'relay-hosting' && <RelayHosting />}
    </>}
    <output aria-live="polite">{busy ? 'Working' : ''}</output>
  </main>;
}
