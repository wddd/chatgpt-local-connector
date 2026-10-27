import { Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SingleChoice } from '../ui';
import { ContextIcon } from './ContextIcon';

export function ContextSettings<T extends string>({ label, value, options, onChange, revealed = false }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; revealed?: boolean;
}) {
  return <Popover><PopoverTrigger asChild><ContextIcon icon={Settings} label={label} revealed={revealed} /></PopoverTrigger>
    <PopoverContent align="end" aria-label={label} onEscapeKeyDown={event => event.stopPropagation()}>
      <SingleChoice label={label} value={value} options={options} onChange={value => { const option = options.find(option => option.value === value); if (option) onChange(option.value); }} />
    </PopoverContent></Popover>;
}
