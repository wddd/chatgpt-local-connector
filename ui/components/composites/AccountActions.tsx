import { useId, useState } from 'react';
import { t } from '../../i18n';
import { ActionGroup, Button, Dialog, FormField, Input, Notice } from '../ui';

export function AccountActions({ alias, onRename, onRemove }: {
  alias: string; onRename: (alias: string) => Promise<void>; onRemove: () => Promise<void>;
}) {
  const id = useId();
  const [mode, setMode] = useState<'rename' | 'remove'>(), [value, setValue] = useState(alias);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [invalid, setInvalid] = useState(false);
  async function submit() {
    if (mode === 'rename' && !value.trim()) { setInvalid(true); document.getElementById(id)?.focus(); return; }
    setBusy(true); setError('');
    try { if (mode === 'rename') await onRename(value.trim()); else await onRemove(); setMode(undefined); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <>
    <ActionGroup>
      <Button onClick={() => { setValue(alias); setInvalid(false); setError(''); setMode('rename'); }}>{t('panels.rename')}</Button>
      <Button variant="danger-outline" onClick={() => { setError(''); setMode('remove'); }}>{t('remove')}</Button>
    </ActionGroup>
    {mode && <Dialog centered title={mode === 'rename' ? t('panels.rename') : t('accounts.removeTitle', { alias })} busy={busy} onClose={() => setMode(undefined)}
      footer={<><Button disabled={busy} onClick={() => setMode(undefined)}>{t('cancel')}</Button><Button type="submit" form={`${id}-form`} variant={mode === 'remove' ? 'danger' : 'primary'} busy={busy}>{t(mode === 'remove' ? 'remove' : 'save')}</Button></>}>
      <form id={`${id}-form`} onSubmit={event => { event.preventDefault(); void submit(); }}>
        {mode === 'rename' ? <FormField id={id} label={t('accounts.alias')} error={invalid ? t('fieldRequired') : undefined}>
          <Input id={id} autoFocus value={value} disabled={busy} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={event => { setValue(event.target.value); setInvalid(false); }} />
        </FormField> : <p>{t('accounts.removeConsequence')}</p>}
        {error && <Notice>{error}</Notice>}
      </form>
    </Dialog>}
  </>;
}
