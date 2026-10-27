import ContextActionsFixture from './scenarioContextActions';
import { useState } from 'react';
import { pageFixture } from './scenarios';
import QuotaBubble from './subscriptions/QuotaBubble';
import { subscriptions } from './state/subscriptions';
import { accounts } from './state/accounts';
import { Button } from './components/ui';
import AgentsSettings from './components/AgentsSettings';
import AddAccount from './components/AddAccount';

export default function PagesFixture() {
  const [open, setOpen] = useState(true);
  const state = accounts.use(), quota = subscriptions.use().snapshot?.providers[0];
  const close = () => setOpen(false);
  return <main className="mx-auto grid h-dvh w-full max-w-3xl gap-4 overflow-auto bg-background p-6 max-sm:p-3">
    {!open && <Button onClick={() => setOpen(true)}>Reopen fixture</Button>}
    {open && <>
      {pageFixture === 'context-actions' && <ContextActionsFixture />}
      {pageFixture === 'agents-settings' && <AgentsSettings onClose={close} />}
      {pageFixture === 'add-account' && <AddAccount onClose={close} initialLogin={state.login ?? undefined} />}
      {pageFixture === 'quota-segments' && quota && <QuotaBubble provider={quota} />}
    </>}
  </main>;
}
