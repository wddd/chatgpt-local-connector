import postcss from 'postcss';
import ts from 'typescript';

// WCAG relative luminance operates on linearized sRGB, not rounded display ratios.
export function contrastRatio(first, second) {
  const luminance = color => color.map(value => value / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (high + .05) / (low + .05);
}

// Read the existing palette declaration as data without executing theme.ts/browser state.
export function themeAccents(source) {
  const file = ts.createSourceFile('theme.ts', source, ts.ScriptTarget.Latest, true);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'themeColors') {
      const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      result = Object.fromEntries(value.properties.map(property => [property.name.getText(file), Object.fromEntries(property.initializer.properties
        .filter(item => ['light', 'dark'].includes(item.name.getText(file)))
        .map(item => [item.name.getText(file), item.initializer.text]))]));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result || !Object.keys(result).length) throw new Error('No theme accents found for contrast validation.');
  return result;
}

function argumentsOf(value) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  return [...parts, value.slice(start).trim()];
}
function color(value) {
  if (/^#[\da-f]{3}$/i.test(value)) value = '#' + [...value.slice(1)].map(c => c + c).join('');
  if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16));
  if (value.startsWith('color-mix(') && value.endsWith(')')) {
    const [space, first, second] = argumentsOf(value.slice(10, -1));
    const weighted = /^(.*)\s+([\d.]+)%$/.exec(first);
    if (space === 'in srgb' && weighted) {
      const weight = Number(weighted[2]) / 100, a = color(weighted[1]), b = color(second);
      if (weight >= 0 && weight <= 1) return a.map((channel, i) => channel * weight + b[i] * (1 - weight));
    }
  }
  throw new Error(`Unsupported token color in contrast validation: ${value}`);
}

// These are the semantic surfaces shared status/phase text can inherit, including
// selected rows, raised update steps, recommendations and nested tone badges.
const backgrounds = ['background', 'card', 'popover', 'secondary', 'accent', 'surface-soft',
  'success-soft', 'warning-soft', 'danger-soft', 'task-live-soft', 'role-source-soft', 'role-agent-soft'];
const foregrounds = ['foreground', 'muted-foreground', 'brand-accent', 'success', 'warning', 'destructive',
  'role-source', 'role-agent', 'phase-thinking', 'phase-command', 'phase-file', 'phase-tool', 'phase-text'];

/** Pure computation over current semantic declarations and selected palette data. */
export function tokenContrastPairs(source, { theme, palette, accent }) {
  const sheet = postcss.parse(source), tokens = {};
  sheet.walkRules(rule => {
    // Host-supplied MCP colors are external; this invariant covers ARC-owned themes.
    if (rule.parent.type !== 'root') return;
    const matches = rule.selectors.some(selector => selector.startsWith(':root') && !selector.includes('data-surface')
      && (!selector.includes('data-theme=') || selector.includes(`[data-theme="${theme}"]`))
      && (!selector.includes('data-theme-color=') || selector.includes(`[data-theme-color="${palette}"]`)));
    if (matches) rule.walkDecls(/^--/, declaration => { tokens[declaration.prop] = declaration.value; });
  });
  sheet.walkAtRules('theme', rule => rule.walkDecls(/^--(?:text-color|color)-/, declaration => { tokens[declaration.prop] = declaration.value; }));
  tokens['--brand-accent'] = accent;
  function resolve(value, seen = new Set()) {
    return value.replace(/var\((--[\w-]+)\)/g, (_, key) => {
      if (seen.has(key) || tokens[key] === undefined) throw new Error(`Unresolved contrast token: ${key}`);
      return resolve(tokens[key], new Set([...seen, key]));
    });
  }
  const rows = [];
  for (const foreground of foregrounds) for (const background of backgrounds) {
    const fg = color(resolve(`var(--${tokens[`--text-color-${foreground}`] ? 'text-color' : 'color'}-${foreground})`));
    const bg = color(resolve(`var(--${background})`));
    rows.push({ theme, palette, foreground, background, ratio: contrastRatio(fg, bg), minimum: 4.5 });
  }
  // Completed task bubbles retain their visual de-emphasis. Text and the card
  // are composited together over the surrounding surface before comparison.
  const opacity = Number(tokens['--task-completed-opacity']);
  if (!(opacity > 0 && opacity <= 1)) throw new Error('Invalid completed-task opacity token.');
  const composite = (ink, backdrop) => ink.map((value, i) => value * opacity + backdrop[i] * (1 - opacity));
  for (const foreground of ['muted-foreground', 'success']) for (const background of ['background', 'card', 'popover', 'secondary', 'accent']) {
    const backdrop = color(resolve(`var(--${background})`));
    const fg = composite(color(resolve(`var(--${foreground})`)), backdrop);
    const bg = composite(color(resolve('var(--card)')), backdrop);
    rows.push({ theme, palette, foreground, background: `completed-card over ${background}`, ratio: contrastRatio(fg, bg), minimum: 4.5 });
  }
  return rows;
}
