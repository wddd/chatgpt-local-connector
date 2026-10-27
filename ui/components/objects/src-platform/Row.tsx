import { controlSource } from '../../../controlSources';
import { EntityRow, PlatformIcon } from '../../ui';
import '../objects.css';

export function SrcPlatformRow({ product, label, compact, constraint, selected, disabled, onOpen }: {
  product: string; label?: string; compact?: boolean; constraint?: string; selected?: boolean; disabled?: boolean; onOpen?: () => void;
}) {
  const info = controlSource(product);
  return <EntityRow className="object-row" leading={<PlatformIcon role="source" platform={product} />}
    title={label ?? (compact ? info?.shortName : info?.displayName) ?? product} secondary={constraint || undefined}
    selected={selected} disabled={disabled} onClick={onOpen} chevron={!!onOpen} />;
}
