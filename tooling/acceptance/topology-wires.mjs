// Browser-only painting evidence. Geometry and intentionally filled landscape
// tentacles remain with their existing painters.
export async function measureTopologyWires(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.topology-scene .topology-wires[data-inactive="false"]');
    if (!svg) throw new Error('No active homepage wire surface');
    const paths = [...svg.querySelectorAll('path')].filter(path => {
      if (!path.getAttribute('d') || path.getTotalLength() === 0 || path.classList.contains('topology-path-hit')) return false;
      for (let node = path; node && node !== svg; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) === 0) return false;
      }
      return true;
    }).map(path => {
      const style = getComputedStyle(path);
      const kind = ['portrait-rail', 'portrait-task', 'topology-ear', 'topology-outer-arc', 'connecting-wire', 'wire-break', 'external-wire', 'task-body', 'activity-flow'].find(name => path.classList.contains(name)) ?? 'primary-body';
      return { kind, d: path.getAttribute('d'), state: path.getAttribute('data-state') ?? path.parentElement.getAttribute('data-state'),
        fill: style.fill, stroke: style.stroke, strokeWidth: parseFloat(style.strokeWidth),
        linecap: style.strokeLinecap, linejoin: style.strokeLinejoin, dasharray: style.strokeDasharray,
        flow: path.matches('.activity-flow,.connecting-wire'), animation: style.animationName, duration: style.animationDuration,
        dashoffset: style.strokeDashoffset };
    });
    return { orientation: svg.classList.contains('portrait-wires') ? 'portrait' : 'landscape', paths };
  });
}

export function assertTopologyWires(measurement) {
  // Regression: 24840f1 omitted portrait rail/task paint, leaving black fill and no stroke.
  const { orientation, paths } = measurement;
  if (paths.filter(path => path.kind === 'topology-ear').length !== 2) throw new Error('Both topology earcups must be painted');
  if (orientation === 'portrait' && !paths.some(path => path.kind === 'portrait-rail')) throw new Error('Portrait rails were not painted');
  const unpainted = paths.filter(path => !['primary-body', 'task-body'].includes(path.kind)
    && (path.fill !== 'none' || path.stroke === 'none' || path.stroke === 'rgba(0, 0, 0, 0)' || !(path.strokeWidth > 0)));
  if (unpainted.length) throw new Error(`Wires must be stroked without fill: ${JSON.stringify(unpainted)}`);
  const filled = paths.filter(path => ['primary-body', 'task-body'].includes(path.kind));
  if (filled.some(path => path.fill === 'none' || path.fill === 'rgba(0, 0, 0, 0)')) throw new Error('Landscape tentacles lost their filled silhouettes');
  if (paths.some(path => path.kind === 'portrait-rail' && (path.linecap !== 'round' || path.linejoin !== 'round'))) throw new Error('Portrait rail corners must stay rounded');
}

export async function acceptTopologyWires(page) {
  const measurement = await measureTopologyWires(page);
  assertTopologyWires(measurement);
  return measurement;
}
