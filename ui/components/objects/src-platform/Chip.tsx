import type { ComponentProps } from 'react';
import { controlSource, sourceProductName } from '../../../controlSources';
import type { ControlSource } from '../../../state/types';
import { PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { Reference } from '../Reference';

export function SrcPlatformChip({ product, sources, compact, onOpen, ...props }: Omit<ComponentProps<typeof Reference>, 'children' | 'referenceId'> & { product: string; sources?: readonly ControlSource[]; compact?: boolean }) {
  const info = controlSource(product), live = sources?.filter(source => source.product === product);
  const state = live?.length && live.every(source => source.state === live[0].state && !!source.pendingSwitch === !!live[0].pendingSwitch)
    ? live[0].pendingSwitch ? 'pending-switch' : live[0].state : undefined;
  return <Reference {...props} onOpen={info ? onOpen : undefined}><PlatformIcon role="source" platform={product} size={16} />
    <span>{sourceProductName(product, compact)}</span>{live?.length ? <StateBadge variant="dot" presentation={statePresentation('source', state)} /> : null}
  </Reference>;
}
