import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';
import { uiFiles, isFeatureFile, relativeFile, brandStylesheets, isBrandSelector, isFixtureCss, isFoundationSelector } from './ui-policy.mjs';
import postcss from 'postcss';
import { checkCssSelectors } from './ui-css-policy.mjs';

const eslintBaselinePath = 'tooling/ui-eslint-baseline.json';
const cssBaselinePath = 'tooling/ui-css-baseline.json';
const eslintBaseline = JSON.parse(readFileSync(eslintBaselinePath, 'utf8'));
const cssBaseline = JSON.parse(readFileSync(cssBaselinePath, 'utf8'));
const failures = [];
const eslint = new ESLint();
const results = await eslint.lintFiles(uiFiles);
for (const result of results) {
  for (const message of result.messages) failures.push(`${relativeFile(result.filePath)}:${message.line}:${message.column} [${message.ruleId ?? 'syntax'}] ${message.message}`);
}
const linted = new Set(results.map(result => relativeFile(result.filePath)));
for (const file of Object.keys(eslintBaseline.files)) {
  if (!linted.has(file)) failures.push(`${file}: Remove UI ESLint baseline for a deleted or excluded feature file.`);
}
function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? cssFiles(file) : file.endsWith('.css') && file !== 'ui/tokens.css' && !brandStylesheets.has(file) && !isFixtureCss(file) && isFeatureFile(file) ? [file] : [];
  });
}
const stylesheets = cssFiles('ui');
for (const file of stylesheets) failures.push(...checkCssSelectors(readFileSync(file, 'utf8'), file, cssBaseline.files[file] ?? {}));
for (const file of Object.keys(cssBaseline.files)) {
  if (!stylesheets.includes(file)) failures.push(`${file}: Remove CSS baseline for a deleted or excluded feature file.`);
}
// Compare against HEAD locally or the PR base in CI. The initial baseline is
// admitted once when the base has no baseline file; there is no regeneration mode.
const base = process.env.ARC_UI_DEBT_BASE ?? 'HEAD';
// Only the foundation, synthetic fixtures and enumerated brand files may own CSS.
function allCss(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? allCss(file) : file.endsWith('.css') ? [file] : [];
  });
}
postcss.parse(readFileSync('ui/tokens.css', 'utf8')).walkRules(rule => {
  for (const selector of rule.selectors) if (!isFoundationSelector(selector)) failures.push(`ui/tokens.css:${rule.source.start.line}: Feature selectors cannot be hidden in the foundation entry (${selector}).`);
});
for (const file of allCss('ui')) {
  if (file === 'ui/tokens.css' || isFixtureCss(file)) continue;
  if (!brandStylesheets.has(file)) {
    failures.push(`${file}: Non-brand CSS is forbidden, including shared components. Use Tailwind utilities and semantic tokens.`);
    continue;
  }
  postcss.parse(readFileSync(file, 'utf8')).walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
    }
    if (rule.selector === ':root[data-reduced-motion="true"]' && rule.nodes.every(node => node.type !== 'decl')) return;
    for (const selector of rule.selectors) {
      if (!isBrandSelector(file, selector)) failures.push(`${file}:${rule.source.start.line}: Non-brand selector ${JSON.stringify(selector)}. Compose Tailwind utilities in its owning component.`);
    }
  });
}
for (const [path, current] of [[eslintBaselinePath, eslintBaseline], [cssBaselinePath, cssBaseline]]) {
  const exists = execFileSync('git', ['ls-tree', '--name-only', base, '--', path], { encoding: 'utf8' }).trim();
  if (!exists) continue;
  const previous = JSON.parse(execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }));
  const compare = (value, old, keys = []) => {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 1 || value > (old ?? 0)) failures.push(`${path}: UI debt baseline may only shrink (${keys.join(' / ')}). Never suppress new code.`);
      return;
    }
    for (const [key, child] of Object.entries(value)) compare(child, old?.[key], [...keys, key]);
  };
  compare(current.files, previous.files);
}
const debt = [];
for (const [file, rules] of Object.entries(eslintBaseline.files)) {
  for (const [rule, entries] of Object.entries(rules)) debt.push({ file, rule: `arc-ui/${rule}`, count: Object.values(entries).reduce((sum, count) => sum + count, 0) });
}
for (const [file, entries] of Object.entries(cssBaseline.files)) debt.push({ file, rule: 'shared-layout-css', count: Object.values(entries).reduce((sum, count) => sum + count, 0) });
debt.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
const rows = debt.map(({ file, rule, count }) => `| ${file} | ${rule} | ${count} |`).join('\n');
const table = `| File | Rule | Count |\n| --- | --- | ---: |\n${rows}`;
const doc = readFileSync('docs/dev/ui-debt.md', 'utf8');
if (doc.split('<!-- ui-debt:start -->\n')[1]?.split('\n<!-- ui-debt:end -->')[0] !== table) failures.push('docs/dev/ui-debt.md: Keep the cleanup table synchronized with the shrinking UI baselines.');
console.log('UI debt baseline (file | rule | count):\n' + rows);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`UI policy passed: ${results.length} source files; ${stylesheets.length} feature stylesheets; ${debt.reduce((sum, entry) => sum + entry.count, 0)} existing violations.`);
