import { useId, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { t } from '../../i18n';
import { Input } from '../ui';
import { ContextIcon } from './ContextIcon';

export function InlineName({ value, onSave, label = t('panels.rename'), revealed = false }: {
  value: string; onSave: (value: string) => Promise<void>; label?: string; revealed?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const pending = useRef(false), cancelled = useRef(false);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function close() { setEditing(false); requestAnimationFrame(() => trigger.current?.focus()); }
  async function save() {
    if (cancelled.current || pending.current) return;
    if (!draft.trim()) { setError(t('fieldRequired')); input.current?.focus(); return; }
    pending.current = true; setBusy(true); setError('');
    try { if (draft.trim() !== value) await onSave(draft.trim()); close(); }
    catch (error) { setError(String(error)); requestAnimationFrame(() => input.current?.focus()); }
    finally { pending.current = false; setBusy(false); }
  }
  return <span className="group/context inline-flex min-w-0 max-w-full flex-col align-middle">
    {editing ? <><Input data-inline-name-edit ref={input} autoFocus aria-label={t('accounts.alias')} value={draft} readOnly={busy} aria-busy={busy} aria-invalid={!!error} aria-describedby={error ? id : undefined}
      onFocus={event => event.currentTarget.select()} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={() => void save()}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending.current) { cancelled.current = true; close(); } }
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void save(); }
      }} />{error && <span id={id} className="text-xs font-normal text-destructive" role="alert">{error}</span>}</>
      : <span className="inline-flex min-w-0 items-center gap-1"><span className="min-w-0 truncate">{value}</span><ContextIcon ref={trigger} icon={Pencil} label={label} revealed={revealed}
        onClick={() => { cancelled.current = false; setDraft(value); setError(''); setEditing(true); }} /></span>}
  </span>;
}
