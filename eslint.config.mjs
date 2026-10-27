import testingLibrary from 'eslint-plugin-testing-library';
import parser from '@typescript-eslint/parser';
import { readFileSync } from 'node:fs';
import { createUiPlugin, uiFiles, uiIgnores } from './tooling/ui-policy.mjs';

const uiBaseline = JSON.parse(readFileSync(new URL('./tooling/ui-eslint-baseline.json', import.meta.url), 'utf8'));

export default [{
  ...testingLibrary.configs['flat/dom'],
  files: ['tests/**/*.{ts,tsx,js,mjs}'],
  languageOptions: { parser },
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  rules: {
    ...testingLibrary.configs['flat/dom'].rules,
    'testing-library/no-container': 'error',
    'testing-library/no-debugging-utils': 'error',
    'testing-library/prefer-explicit-assert': 'error',
    // Each happy-dom test owns a different document; screen binds at import time.
    'testing-library/prefer-screen-queries': 'off',
  },
}, {
  files: uiFiles,
  ignores: uiIgnores,
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  plugins: { 'arc-ui': createUiPlugin(uiBaseline) },
  rules: {
    'arc-ui/shared-controls': 'error',
    'arc-ui/dispatch-spec': 'error',
    'arc-ui/shared-layout': 'error',
    'arc-ui/semantic-utilities': 'error',
    'arc-ui/single-choice': 'error',
  },
}];
