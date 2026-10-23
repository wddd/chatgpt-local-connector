import testingLibrary from 'eslint-plugin-testing-library';
import parser from '@typescript-eslint/parser';

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
}];
