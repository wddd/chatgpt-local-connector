import { useId, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { t } from '../../i18n';
import { Button, Notice } from '../ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';
import { ContextIcon } from './ContextIcon';

type Action = { label: string; onSelect: () => void | Promise<void>; consequence?: string; disabled?: boolean };
export function ObjectMenu({ label, items, revealed = false }: { label: string; items: Action[]; revealed?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null), id = useId();
  const [menu, setMenu] = useState(false), [selected, setSelected] = useState<Action>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const confirming = useRef(false), pending = useRef(false);
  async function execute(item: Action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await item.onSelect(); setSelected(undefined); confirming.current = false; }
    catch (error) { setError(String(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!items.length) return null;
  return <span className="group/context inline-flex"><Popover open={!!selected} onOpenChange={open => { if (!open && !busy) { setSelected(undefined); confirming.current = false; } }}>
    <DropdownMenu open={menu} onOpenChange={setMenu}>
      <PopoverAnchor asChild><DropdownMenuTrigger asChild><ContextIcon ref={trigger} icon={Ellipsis} label={label} revealed={revealed || !!selected} /></DropdownMenuTrigger></PopoverAnchor>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (confirming.current) event.preventDefault(); }} onEscapeKeyDown={event => event.stopPropagation()}>
        {items.map(item => <DropdownMenuItem key={item.label} disabled={item.disabled || busy} variant={item.consequence ? 'destructive' : 'default'} onSelect={() => {
          setError(''); confirming.current = !!item.consequence; if (item.consequence) setSelected(item); else void execute(item);
        }}>{item.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    <PopoverContent align="end" aria-label={selected?.label} aria-describedby={id} onEscapeKeyDown={event => { event.stopPropagation(); if (busy) event.preventDefault(); }}
      onInteractOutside={event => { if (busy) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
      <p id={id} className="text-sm">{selected?.consequence}</p>
      {error && <Notice>{error}</Notice>}
      <div className="mt-3 flex justify-end gap-2"><Button disabled={busy} onClick={() => { setSelected(undefined); confirming.current = false; }}>{t('cancel')}</Button>
        <Button variant="danger" busy={busy} onClick={() => selected && void execute(selected)}>{selected?.label}</Button></div>
    </PopoverContent>
  </Popover>{error && !selected && <Notice>{error}</Notice>}</span>;
}
