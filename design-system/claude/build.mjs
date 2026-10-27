import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { previews, previewHtml } from './previews.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(here, '../..');
const project = path.join(here, 'project');
const read = relative => readFile(path.join(root, relative), 'utf8');
const json = value => JSON.stringify(value, null, 2) + '\n';

// Follow the bundle entry's value exports, never a separate publishing subset.
const entry = 'ui/design-mount.ts';
const source = ts.createSourceFile(entry, await read(entry), ts.ScriptTarget.Latest, true);
const exports = [];
for (const statement of source.statements) {
  if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
  if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
    throw new Error(`Use explicit named exports in ${entry} so Claude Design can enumerate them.`);
  }
  for (const item of statement.exportClause.elements) {
    if (!item.isTypeOnly && item.name.text !== 'fixtures') exports.push(item.name.text);
  }
}
if (!exports.length || new Set(exports).size !== exports.length) throw new Error(`Invalid component export list in ${entry}.`);
for (const name of exports) {
  if (!Object.hasOwn(previews, name)) throw new Error(`Add a Claude Design preview for Arc.${name} in design-system/claude/previews.mjs.`);
}

// The ordinary check uses this same enumeration without requiring generated assets.
if (process.argv.includes('--check')) {
  console.log(`Claude Design previews cover all ${exports.length} component exports.`);
  process.exit(0);
}

let bundle, tokenCss, componentCss, sourceTokens;
try {
  [bundle, tokenCss, componentCss, sourceTokens] = await Promise.all([
    read('design-system/dist/arc.js'), read('design-system/dist/tokens.css'),
    read('design-system/dist/arc.css'), read('design-system/dist/tokens.json').then(JSON.parse),
  ]);
} catch (error) {
  throw new Error('Run npm run design:bundle before npm run design:claude.', { cause: error });
}
if (/<\/script|<!--/i.test(bundle)) throw new Error('dist/arc.js contains an unsafe inline script delimiter (</script or <!--).');
const css = `${tokenCss}\n${componentCss}`;
if (/<\/style/i.test(css)) throw new Error('The combined CSS contains an unsafe inline style delimiter (</style).');

const usage = {
  canvas: 'App window background behind the homepage topology.',
  surface: 'Panels, sheets and dialogs.',
  'surface-subtle': 'Grouped rows, inactive tracks and quiet fills.',
  'surface-raised': 'Floating layers such as popovers.',
  text: 'Primary text on surface.',
  'text-secondary': 'Secondary lines and metadata on surface.',
  'text-tertiary': 'Least prominent labels on surface.',
  border: 'Hairline borders and dividers.',
  'border-strong': 'Control borders and emphasized dividers.',
  hover: 'Hover fill for rows and ghost buttons.',
  action: 'Primary button fill.',
  'on-action': 'Text and icons on action.',
  accent: 'Neutral hover and selected surface.',
  'brand-accent': 'Selection, focus and running-task emphasis. The single colored UI accent.',
  'brand-ink': 'ARC mark ink.',
  'brand-orange': 'Brand accent used by the mark and promotional surfaces, not for UI state.',
  'role-source': 'Control-source (SRC) role color: tags and the left topology wing.',
  'role-agent': 'Agent role color: tags and the right topology wing.',
  'topology-error': 'Error wires on the homepage topology.',
  success: 'Success state dots and badges.',
};
function colorUsage(name) {
  if (Object.hasOwn(usage, name)) return usage[name];
  if (name.startsWith('phase-')) return `Task phase color for ${name.slice(6)} steps in task bubbles and timelines.`;
  if (name.startsWith('brand-agent')) return 'Agent brand gradient stop.';
  if (name.startsWith('quota')) return 'Quota ring and bar color.';
  if (/^(warning|danger|success)/.test(name)) return `Semantic state color (${name}).`;
  return `ARC theme color \`${name}\`, as used by the app.`;
}
// Claude Design accepts literal color channels, not CSS expressions or relative colors.
const literalColor = /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(\s*[-+\d.%,/\s]+\))$/i;
const dropped = [];
const colorTokens = [];
for (const name of new Set([...Object.keys(sourceTokens.colors.light), ...Object.keys(sourceTokens.colors.dark)])) {
  const value = {};
  for (const theme of ['light', 'dark']) {
    const raw = sourceTokens.colors[theme][name] ?? sourceTokens.colors.light[name];
    if (typeof raw === 'string' && literalColor.test(raw.trim())) value[theme] = raw.trim();
    else dropped.push({ name, theme, value: raw ?? null });
  }
  if (value.light) colorTokens.push({ name, value, usage: colorUsage(name) });
}
const list = (values, describe) => ({ tokens: Object.entries(values).map(([name, value]) => ({ name, value, usage: describe(name) })) });
const tokens = {
  name: 'ARC Design System', version: 1,
  meta: { source: 'agent-remote-control ui/tokens.css via npm run design:bundle' },
  color: { themes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }], tokens: colorTokens },
  type: {
    fonts: [],
    families: Object.fromEntries(['ui', 'mono'].map(name => [name, sourceTokens.fontFamilies[`font-${name}`].replace(/\s+/g, ' ').trim()])),
    groups: [{ name: 'Text', family: 'ui', styles: [
      ['text-title', 'title', 600, 'Page and sheet titles.'],
      ['text-lg', 'heading', 600, 'Panel and dialog headings.'],
      ['text-md', 'body', 400, 'Default UI text.'],
      ['text-sm', 'secondary', 400, 'Rows, metadata and controls.'],
      ['text-xs', 'caption', 400, 'Captions, chips and timestamps.'],
    ].map(([key, name, fontWeight, description]) => {
      const fontSize = sourceTokens.typeScale[key];
      if (!fontSize?.endsWith('px')) throw new Error(`Missing pixel text scale token: ${key}.`);
      return { name, fontSize, fontWeight, usage: `${description} Token: --${key}.` };
    }) }],
  },
  spacing: list(sourceTokens.spacing, name => `Spacing step ${name.split('-')[1]}.`),
  radius: { tokens: [
    ['radius-control', '10px', 'Buttons, inputs, chips.'],
    ['radius-row', '12px', 'List rows and grouped row containers.'],
    ['radius-card', '14px', 'Cards inside panels.'],
    ['radius-panel', '20px', 'Side panels, sheets and dialogs.'],
    ['radius-pill', '999px', 'Status pills and fully rounded controls.'],
  ].map(([name, fallback, usage]) => ({ name, value: sourceTokens.radius[name] ?? fallback, usage })) },
  size: { note: 'Control dimensions.', tokens: [
    ['control-sm', 'Small control height.'], ['control-md', 'Default control height.'],
    ['button-height', 'Button height.'], ['icon-button-size', 'Icon button square.'],
  ].filter(([name]) => name in sourceTokens.themes.light).map(([name, usage]) => ({ name, value: sourceTokens.themes.light[name], usage })) },
};

const cards = await Promise.all(exports.map(async name => {
  const card = (await read(`design-system/api/components/${name}.md`))
    .replace(/^# Arc\.[^\n]+/, `# ${name}`)
    .replace(/\]\((?:\.\/)?([\w]+)\.md(#[^)]*)?\)/g, (link, target, anchor = '') => {
      if (target === 'fixtures') return '](../../README.md#fixtures)';
      if (!exports.includes(target)) throw new Error(`Unknown component link ${target}.md in ${name}.md.`);
      return `](../${target}/README.md${anchor})`;
    });
  return [name, card];
}));
const sourceReadme = await read('design-system/README.md');
const exportRows = exports.map(name => {
  const row = sourceReadme.split('\n').find(line => line.startsWith(`| [${name}](api/components/${name}.md) |`));
  if (!row) throw new Error(`Document Arc.${name} in the design-system/README.md exports table.`);
  return row.replace(`api/components/${name}.md`, `components/${name}/README.md`);
});
const readme = (await read('design-system/claude/brand-book.md'))
  .replace('<!-- exports -->', `| Export | Purpose |\n| --- | --- |\n${exportRows.join('\n')}`);
const index = JSON.parse(await read('design-system/claude/design-system.json'));
const now = new Date().toISOString();
const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
index.createdOnFiles.at = index.lastChange.at = now;
index.lastChange.note = `Generated from agent-remote-control design-system build ${hash}`;
const cover = await read('design-system/claude/cover-preview.html');

// Validate all inputs before replacing generated output; remove obsolete component cards.
await rm(project, { recursive: true, force: true });
async function write(relative, contents) {
  const file = path.join(project, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}
await write('tokens.json', json(tokens));
await write('components/bundle.js', `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'Arc', components: exports.map(name => ({ name })) })} */\n${bundle}`);
await write('components/bundle.css', css);
for (const [name, card] of cards) {
  await write(`components/${name}/README.md`, card);
  await write(`components/${name}/preview.html`, previewHtml(name));
}
await write('components/Cover/preview.html', cover);
await write('README.md', readme);
await write('design-system.json', json(index));
console.log(json({ project: 'design-system/claude/project', files: 6 + exports.length * 2, exports, colors: colorTokens.length,
  droppedColorTokens: [...new Set(dropped.map(item => item.name))], droppedColorValues: dropped }));
