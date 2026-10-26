import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { accountsApi } from "../api";
import { refreshAccounts } from "../state/accounts";
import { refreshConnector } from "../state/connector";
import type { ProviderAccount as Account } from "../types";
import { t } from "../i18n";
import { Button, Dialog, Field, Icon, Input, Notice, Tag } from "./ui";
import { Sensitive, SensitiveIdentity } from "./Sensitive";
import MergeAccounts from "./MergeAccounts";

export default function AccountMaintenance({ account, children, onRemoved }: { account: Account; children?: ReactNode; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [removing, setRemoving] = useState(false), [merging, setMerging] = useState(false);
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await work(); await refreshAccounts(); return true; }
    catch (e) { setError(String(e)); return false; }
    finally { setBusy(false); }
  }
  return <>
    <section className="account-card">
      <div className="source-section-heading"><AccountAlias account={account} busy={busy} onSave={alias => action(() => accountsApi.update({ id: account.id, alias }))} /><Button variant="ghost" disabled={busy} onClick={() => setMerging(true)}>{t("accounts.merge")}</Button></div>
      <SensitiveIdentity email={account.email} orgName={account.orgName} wrap />
      {account.plan && <Tag>{account.plan}</Tag>}
      <div><Sensitive wrap>{account.identityKey}</Sensitive></div>
    </section>
    {error && !removing && <Notice>{error}</Notice>}
    {children}
    <div className="account-remove"><p className="muted">{t("accounts.removeConsequence")}</p><Button variant="danger-outline" disabled={busy} onClick={() => setRemoving(true)}>{t("remove")}</Button></div>
    {removing && <Dialog centered title={t("accounts.removeTitle", { alias: account.alias })} busy={busy} onClose={() => setRemoving(false)} footer={<><Button disabled={busy} onClick={() => setRemoving(false)}>{t("cancel")}</Button><Button variant="danger" busy={busy} onClick={() => void action(async () => { await accountsApi.remove({ id: account.id, running: "finish" }); await refreshConnector(); }).then(done => { if (done) { setRemoving(false); onRemoved(); } })}>{t("remove")}</Button></>}><p>{t("accounts.removeConsequence")}</p>{error && <Notice>{error}</Notice>}</Dialog>}
    {merging && <MergeAccounts account={account} onClose={() => setMerging(false)} />}
  </>;
}

function AccountAlias({ account, busy, onSave }: { account: Account; busy: boolean; onSave: (alias: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false), [alias, setAlias] = useState(account.alias), [error, setError] = useState('');
  const active = useRef(false), saving = useRef(false), restoreFocus = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!editing && restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus(); } }, [editing]);
  function finish(returnFocus: boolean) { active.current = false; restoreFocus.current = returnFocus; setEditing(false); }
  async function save(returnFocus: boolean) {
    if (!active.current || saving.current) return;
    const value = alias.trim();
    if (!value) { setError(t('fieldRequired')); document.getElementById('account-detail-alias')?.focus(); return; }
    saving.current = true;
    try { if (value === account.alias || await onSave(value)) finish(returnFocus); }
    finally { saving.current = false; }
  }
  return editing ? <form className="account-alias-editor" onSubmit={event => { event.preventDefault(); void save(true); }}>
    <Field id="account-detail-alias" label={<span className="sr-only">{t('accounts.alias')}</span>} error={error}>
      <Input id="account-detail-alias" autoFocus value={alias} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'account-detail-alias-error' : undefined}
        onFocus={event => event.currentTarget.select()} onChange={event => { setAlias(event.target.value); setError(''); }} onBlur={() => void save(false)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') { event.preventDefault(); void save(true); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); }
        }} />
    </Field>
  </form> : <h2><Button ref={trigger} variant="ghost" className="account-alias-trigger" disabled={busy} aria-label={t('accounts.editAlias', { alias: account.alias })}
    onClick={() => { active.current = true; setAlias(account.alias); setError(''); setEditing(true); }}>{account.alias}<Icon icon={Pencil} /></Button></h2>;
}
