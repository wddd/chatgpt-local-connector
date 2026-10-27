import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio, themeAccents, tokenContrastPairs } from '../tooling/token-contrast.mjs';

const tokens = readFileSync(new URL('../ui/tokens.css', import.meta.url), 'utf8');
const palettes = themeAccents(readFileSync(new URL('../ui/theme.ts', import.meta.url), 'utf8'));

test('semantic text remains readable on every shared tone surface in both themes', () => {
  // Property: each supported palette keeps small semantic text at or above 4.5:1 on every shared text surface.
  for (const [palette, accents] of Object.entries(palettes)) for (const theme of ['light', 'dark']) {
    for (const pair of tokenContrastPairs(tokens, { theme, palette, accent: accents[theme] })) {
      assert.ok(pair.ratio >= pair.minimum, `${theme}/${palette}: ${pair.foreground} on ${pair.background} is ${pair.ratio.toFixed(4)}:1; requires ${pair.minimum}:1`);
    }
  }
});

test('contrast is symmetric, bounded and maximal for black against white', () => {
  // Property: sRGB contrast is symmetric in [1,21], is 1 for identical colors and 21 for black against white.
  const colors = [[0, 0, 0], [255, 255, 255], [12, 95, 220], [0, 128, 64], [194.5, 201.2, 85.3]];
  for (const a of colors) for (const b of colors) {
    const ratio = contrastRatio(a, b);
    assert.ok(ratio >= 1 && ratio <= 21);
    assert.equal(ratio, contrastRatio(b, a));
    assert.equal(contrastRatio(a, a), 1);
  }
  assert.equal(contrastRatio(colors[0], colors[1]), 21);
});
