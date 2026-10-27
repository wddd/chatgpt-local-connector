import test from 'node:test';
import assert from 'node:assert/strict';
import { maskSensitive, sensitiveParts } from '../ui/privacyMask.ts';

test('stand-ins are deterministic, preserve separators and replace every identity character', () => {
  // Property: masking preserves code-point length and separators while substituting every other character deterministically.
  for (const value of ['alex@example.com', 'Example Organization', 'provider:id:123', 'session_01', 'https://arc.example.com/mcp', '组织 🦊', 'I.W@X.io']) {
    for (const bullets of [false, true]) {
      const masked = maskSensitive(value, bullets);
      assert.equal(masked, maskSensitive(value, bullets));
      assert.equal(Array.from(masked).length, Array.from(value).length);
      Array.from(value).forEach((char, index) => {
        if (/[\s@.]/u.test(char)) assert.equal(Array.from(masked)[index], char);
        else assert.notEqual(Array.from(masked)[index], char);
      });
    }
  }
});

test('substring masking preserves prose and treats identities literally', () => {
  // Regression: whole-element blur hid surrounding information and left real identity substrings available.
  const values = ['Example (Team)', 'id:[key]', 'Example (Team) West'];
  const prose = 'Quota for Example (Team) West / alex@example.com / id:[key]: unavailable';
  const parts = sensitiveParts(prose, values);
  assert.equal(parts.map(part => part.text).join(''), prose);
  assert.deepEqual(parts.filter(part => part.sensitive).map(part => part.text), ['Example (Team) West', 'alex@example.com', 'id:[key]']);
  assert.equal(parts.filter(part => !part.sensitive).map(part => part.text).join(''), 'Quota for  /  / : unavailable');
  assert.deepEqual(sensitiveParts('Teamwork / Team / alex@example.com', ['Team', 'alex']).filter(part => part.sensitive).map(part => part.text), ['Team', 'alex@example.com']);
});
