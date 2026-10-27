import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import postcss from 'postcss';
import { transform } from 'lightningcss';
import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'design-system/dist');
const resolve = name => path.join(root, name);
const adapter = name => resolve(`ui/design-mount/${name}`);
const aliases = new Map([
  ['ui/state/dispatchCatalog.ts', 'dispatchCatalog.ts'],
  ['ui/i18n.ts', 'i18n.ts'], ['ui/state/store.ts', 'store.ts'],
  ['ui/state/appEnvironment.ts', 'environment.ts'], ['ui/state/privacy.ts', 'privacy.ts'],
  ['ui/platform.ts', 'platform.ts'], ['ui/api.ts', 'api.ts'],
  ...['accounts', 'connector', 'subscriptions', 'activity', 'updates', 'overviewPanels'].map(name => [`ui/state/${name}.ts`, 'data.ts']),
].map(([from, to]) => [resolve(from), adapter(to)]));
const uiAlias = { '@': path.join(root, 'ui') };
const cssFiles = new Set(['topology', 'quota', 'task-bubbles'].map(name => resolve(`ui/brand/${name}.css`)));
const sourceFiles = new Set();
const boundary = () => ({
    name: 'arc-design-boundary', enforce: 'pre',
    async resolveId(source, importer) {
      if (source === 'radix-ui' && importer !== adapter('radix.tsx')) return adapter('radix.tsx');
      if (!importer || !source.startsWith('.')) return;
      const resolved = path.resolve(path.dirname(importer.split('?')[0]), source);
      return aliases.get(resolved) ?? aliases.get(`${resolved}.ts`);
    },
    load(id) {
      if (id.endsWith('.css')) { cssFiles.add(id); return ''; }
      if (id.startsWith(resolve('ui/')) && /\.tsx?$/.test(id)) sourceFiles.add(id);
    },
  });
const runtime = await build({
  configFile: false, root, logLevel: 'warn', resolve: { alias: uiAlias },
  define: { 'process.env.NODE_ENV': '"production"', localStorage: '__arcStorage' },
  plugins: [boundary(), react()],
  build: { write: false, minify: true, lib: { entry: adapter('runtime.tsx'), name: 'ArcRuntime', formats: ['iife'] },
  },
});
const runtimeCode = (Array.isArray(runtime) ? runtime[0] : runtime).output.find(item => item.type === 'chunk').code;
await mkdir(out, { recursive: true });
// Each Root gets private module state and React 19. No eval, globals or React 18 elements enter it.
const factory = `export function createRuntime() { const __arcStorage = { getItem: () => null, setItem() {}, removeItem() {} };\n${runtimeCode}\nreturn ArcRuntime; }`;
await build({
  configFile: false, root, logLevel: 'warn', resolve: { alias: uiAlias },
  plugins: [{ name: 'arc-runtime-factory', resolveId: id => id === 'virtual:arc-runtime' ? '\0arc-runtime' : undefined,
    load: id => id === '\0arc-runtime' ? factory : undefined }, boundary(), react({ jsxRuntime: 'classic' })],
  build: { outDir: out, emptyOutDir: true, minify: true,
    lib: { entry: resolve('ui/design-mount.ts'), name: 'Arc', formats: ['iife'], fileName: () => 'arc.js' },
    rolldownOptions: { external: ['react', 'react-dom'], output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } } } },
});

// Extract current theme declarations; preserve CSS expressions rather than inventing token values.
const theme = postcss.parse(await readFile(resolve('ui/tokens.css'), 'utf8'));
const light = {}, dark = {};
theme.walkRules(rule => {
  if (rule.selector !== ':root' && rule.selector !== ':root[data-theme="dark"]' && rule.selector !== ':root[data-theme-color="arc"]') return;
  const target = rule.selector.includes('dark') ? dark : light;
  rule.walkDecls(/^--/, declaration => { target[declaration.prop.slice(2)] = declaration.value; });
});
theme.walkAtRules('theme', rule => { if (!rule.params) rule.walkDecls(/^--/, declaration => { light[declaration.prop.slice(2)] = declaration.value; }); });
const mergedDark = { ...light, ...dark };
const pick = (values, prefix) => Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith(prefix)));
const resolveColor = (values, value, mode, seen = new Set()) => value
  .replace(/var\(--([\w-]+)\)/g, (match, key) => {
    if (seen.has(key) || !values[key]) return match;
    return resolveColor(values, values[key], mode, new Set([...seen, key]));
  }).replace(/light-dark\((#[\da-f]+),\s*(#[\da-f]+)\)/gi, (_, light, dark) => mode === 'dark' ? dark : light);
const colors = (values, mode) => Object.fromEntries(Object.entries(values)
  .map(([key, value]) => [key, resolveColor(values, value, mode)])
  .filter(([, value]) => /^(?:#|(?:rgb|hsl|oklch|color-mix|light-dark)\()/.test(value)));
await writeFile(path.join(out, 'tokens.json'), JSON.stringify({
  source: 'ui/tokens.css', themes: { light, dark: mergedDark },
  colors: { light: colors(light, 'light'), dark: colors(mergedDark, 'dark') },
  typeScale: pick(light, 'text-'), fontFamilies: pick(light, 'font-'), spacing: pick(light, 'space-'), radius: pick(light, 'radius-'),
}, null, 2) + '\n');
theme.walkAtRules(rule => { if (['import', 'theme', 'custom-variant', 'source', 'layer', 'utility'].includes(rule.name)) rule.remove(); });
theme.walkRules(rule => { rule.selector = rule.selector.replaceAll(':root', '.arc-root'); });
await writeFile(path.join(out, 'tokens.css'), theme.toString());

// Keep selectors used by the imported component modules; drop application page/layout rules.
const classes = new Set();
for (const file of sourceFiles) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const word of node.text.split(/\s+/)) if (/^[\w-]+$/.test(word)) classes.add(word);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
// Compile the same Tailwind entry with the official Vite plugin. Utilities and
// preflight are scoped to each design root; neither can reset the host canvas.
const tailwind = await build({
  configFile: false, root, logLevel: 'warn', plugins: [tailwindcss()],
  build: { write: false, cssMinify: false, rolldownOptions: { input: resolve('ui/tokens.css') } },
});
const compiledCss = (Array.isArray(tailwind) ? tailwind[0] : tailwind).output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
if (!compiledCss.includes('--tw-')) throw new Error('Tailwind utilities were not compiled for the design bundle.');
const styles = postcss.parse(compiledCss);
styles.walkRules(rule => {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
    // Nested selectors already inherit the scoped outer rule.
    if (parent.type === 'rule') return;
  }
  rule.selectors = rule.selectors.map(selector => {
    if (/^:root/.test(selector)) return selector.replace(/^:root/, '.arc-root');
    if (/^(?:html|:host|body)$/.test(selector)) return '.arc-root';
    return `:where(.arc-root) ${selector}`;
  });
});
const orderedCss = [...cssFiles].filter(file => file !== resolve('ui/tokens.css')).sort();
for (const file of orderedCss) {
  const sheet = postcss.parse(await readFile(file, 'utf8'));
  sheet.walkAtRules('import', rule => rule.remove());
  // Flatten native CSS nesting before prefixing selectors.
  const flattened = transform({ filename: file, code: Buffer.from(sheet.toString()), targets: { chrome: 100 << 16 }, minify: false }).code;
  const parsed = postcss.parse(flattened.toString());
  parsed.walkRules(rule => {
    if (rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
    const selectors = rule.selectors.filter(selector => {
      if (/\b(?:html|body)\b|#root/.test(selector)) return false;
      const names = [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]);
      return names.every(name => classes.has(name));
    });
    if (!selectors.length) { rule.remove(); return; }
    rule.selectors = selectors.map(selector => selector.startsWith(':root')
      ? selector.replace(/^:root([^ ]*)\s*/, '.arc-root$1 .arc-island ')
      : `.arc-island ${selector}`);
  });
  styles.append(parsed.nodes);
}
// Scope animation identifiers too, so host keyframes cannot replace component animations.
const animations = new Map();
styles.walkAtRules(/keyframes$/, rule => { animations.set(rule.params, `arc-ds-${rule.params}`); });
const usedAnimations = new Set();
styles.walkDecls(/animation/, declaration => {
  for (const [name, scoped] of animations) {
    const pattern = new RegExp(`(?<![\\w-])${name}(?![\\w-])`, 'g');
    if (pattern.test(declaration.value)) { usedAnimations.add(name); declaration.value = declaration.value.replace(pattern, scoped); }
  }
});
styles.walkAtRules(/keyframes$/, rule => { if (usedAnimations.has(rule.params)) rule.params = animations.get(rule.params); else rule.remove(); });
styles.walkDecls('outline', declaration => { if (declaration.important && declaration.value === 'none') declaration.remove(); });
styles.append(postcss.parse(`
.arc-island { font: 400 var(--text-md)/1.5 var(--font-ui); color: var(--text); }
.arc-island[data-arc-component="Button"], .arc-island[data-arc-component="IconButton"],
.arc-island[data-arc-component="Switch"], .arc-island[data-arc-component="Status"],
.arc-island[data-arc-component="Tag"], .arc-island[data-arc-component="AgentQuotaIcon"],
.arc-island[data-arc-component="PlatformIcon"], .arc-island[data-arc-component="StateBadge"],
.arc-island[data-arc-component="Freshness"], .arc-island[data-arc-component="GraphNode"] { display: inline-block; vertical-align: middle; }
.arc-island[data-arc-component="ActivityBubble"], .arc-island[data-arc-component="TaskNode"] { width: var(--bubble-width, 264px); }
`));
const css = transform({ filename: 'arc.css', code: Buffer.from(styles.toString()), minify: true }).code;
await writeFile(path.join(out, 'arc.css'), css);
for (const file of ['arc.js', 'arc.css', 'tokens.css', 'tokens.json']) {
  const contents = await readFile(path.join(out, file));
  console.log(`${file}: ${contents.length} bytes; gzip ${gzipSync(contents).length} bytes`);
}
