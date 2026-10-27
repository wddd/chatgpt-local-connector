import { controlSource } from '../../../controlSources';
import { EntityRow, PlatformIcon } from '../../ui';

export function SrcPlatformRow({ product, label, compact, constraint, selected, disabled, onOpen }: {
  product: string; label?: string; compact?: boolean; constraint?: string; selected?: boolean; disabled?: boolean; onOpen?: () => void;
}) {
  const info = controlSource(product);
  return <EntityRow className="flex-wrap gap-2 [&_.entity-row-title]:wrap-anywhere [&_.entity-row-copy]:basis-30 [&_.sensitive-value]:max-w-full [&_.sensitive-value]:overflow-hidden [&_.status]:max-w-full [&_.status]:whitespace-normal [&>.actions]:min-w-0 [&>.actions]:max-w-full [&>.entity-row]:basis-72" leading={<PlatformIcon role="source" platform={product} size={20} />}
    title={label ?? (compact ? info?.shortName : info?.displayName) ?? product} secondary={constraint || undefined}
    selected={selected} disabled={disabled} onClick={onOpen} chevron={!!onOpen} />;
}
