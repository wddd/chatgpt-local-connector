import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentConfig } from '../tooling/dev-identity.mjs';

test('isolated development identities cannot collide with installed or ordinary development apps', () => {
  // Regression: acceptance shared the ordinary Dev bundle ID and app name, making native targeting ambiguous.
  const ordinary=developmentConfig({});
  const first=developmentConfig({ARC_DEV_INSTANCE_ID:'1234abcd'});
  const second=developmentConfig({ARC_DEV_INSTANCE_ID:'abcd1234'});
  assert.notEqual(first.identifier,ordinary.identifier);assert.notEqual(first.identifier,second.identifier);
  assert.notEqual(first.productName,ordinary.productName);assert.notEqual(first.productName,second.productName);
  assert.throws(()=>developmentConfig({ARC_DEV_INSTANCE_ID:'../bad'}));
});
