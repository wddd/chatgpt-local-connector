import postcss from 'postcss';

const layoutName = /(?:^|[^a-z0-9])(?:rows?|cards?|forms?|fields?|headers?|headings?|actions?|settings?|tags?|clusters?)(?:$|[^a-z0-9])/i;
const layoutProperty = /^(?:margin(?:-|$)|padding(?:-|$)|(?:row-|column-)?gap$|display$|flex(?:-|$)|grid(?:-|$)|align-|justify-|place-|order$|float$|clear$|columns?$|column-(?:count|width|rule))/;

export function cssLayoutSelectors(source, file) {
  const entries = [];
  postcss.parse(source, { from: file }).walkRules(rule => {
    // Frame percentages are animation geometry, not feature layout selectors.
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    }
    const hasLayout = node => node.type === 'decl' ? layoutProperty.test(node.prop.toLowerCase())
      : node.type === 'atrule' && !!node.nodes?.some(hasLayout);
    const layout = rule.nodes.some(hasLayout);
    for (const selector of rule.selectors) {
      if (layout || layoutName.test(selector)) entries.push({ selector: selector.trim(), line: rule.source.start.line });
    }
  });
  return entries;
}
export function checkCssSelectors(source, file, baseline) {
  const seen = new Map(), failures = [];
  for (const { selector, line } of cssLayoutSelectors(source, file)) {
    const count = (seen.get(selector) ?? 0) + 1;
    seen.set(selector, count);
    if (count > (baseline[selector] ?? 0)) failures.push(`${file}:${line} [shared-layout-css] New feature layout selector ${JSON.stringify(selector)}. Compose or extend shared shells in ui/components/ui, composites or objects (with a fixture and design-mount export); do not expand the baseline.`);
  }
  for (const [selector, count] of Object.entries(baseline)) {
    if ((seen.get(selector) ?? 0) < count) failures.push(`${file} [shared-layout-css] Remove stale baseline selector ${JSON.stringify(selector)} and update docs/dev/ui-debt.md.`);
  }
  return failures;
}
