import { controlSource } from '../../../controlSources';
import type { WireState } from '../../../topology/render';
import { PlatformIcon } from '../../ui';
import GraphNode from '../../GraphNode';

export function SrcPlatformNode({ product, state, selected, newlyAdded, onOpen, onMove, count }: {
  product: string; state: WireState; selected?: boolean; newlyAdded?: boolean; onOpen: () => void; onMove?: (by: number) => void; count?: number;
}) {
  const name = controlSource(product)?.displayName ?? product;
  return <GraphNode label={name} state={state} highlighted={selected} newlyAdded={newlyAdded} onOpen={onOpen} onMove={onMove}>
    <PlatformIcon role="source" platform={product} panelVisual /><span className="graph-node-name">{name}{count !== undefined && <span className="section-header-count">{count}</span>}</span>
  </GraphNode>;
}
