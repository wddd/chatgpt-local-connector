import { MoveHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { IconButton, SingleChoice } from '../ui';

export function ContextSettings<T extends string>({ label, value, options, onChange, revealed = false }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; revealed?: boolean;
}) {
  return <Popover><PopoverTrigger asChild><IconButton icon={MoveHorizontal} label={label}
    className={revealed ? '' : 'opacity-0 group-hover/context:opacity-100 group-focus-within/context:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100'} /></PopoverTrigger>
    <PopoverContent className="w-fit p-2" align="end" aria-label={label} onEscapeKeyDown={event => event.stopPropagation()}>
      <SingleChoice compact label={label} value={value} options={options} onChange={value => { const option = options.find(option => option.value === value); if (option) onChange(option.value); }} />
    </PopoverContent></Popover>;
}
