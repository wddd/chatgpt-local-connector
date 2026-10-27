import { useId, useLayoutEffect, useRef, type Ref } from 'react';
import { TopologyAnimator } from '../../../topology/animate';
import type { Layout } from '../../../topology/solve';
import { TopologyPainter, type PaintNode, type PaintTask } from '../../../topology/render';
import { PortraitPainter } from '../../../topology/portraitRender';

/** The existing painters own wire geometry. A supplied frame mounts the same painters without a live topology host. */
export function TunnelNode({ svgRef, orientation = 'landscape', frame }: {
  svgRef?: Ref<SVGSVGElement>; orientation?: 'landscape' | 'portrait'; frame?: { layout: Layout; nodes: PaintNode[]; tasks: PaintTask[] };
}) {
  const local = useRef<SVGSVGElement>(null), prefix = useId();
  useLayoutEffect(() => {
    if (!frame || !local.current) return;
    const animator = new TopologyAnimator();
    animator.setTargets(frame.layout); animator.step(0, true);
    const painter = orientation === 'portrait' ? new PortraitPainter(local.current, prefix) : new TopologyPainter(local.current, prefix);
    painter.paint(animator, frame.nodes, frame.tasks, null);
    return () => painter.dispose();
  }, [frame, orientation, prefix]);
  return <svg ref={svgRef ?? local} className={`topology-wires${orientation === 'portrait' ? ' portrait-wires' : ''}`} aria-hidden="true" />;
}
