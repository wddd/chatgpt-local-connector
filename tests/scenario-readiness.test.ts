import test from 'node:test';
import assert from 'node:assert/strict';
import { beginScenario, finishScenario, scenarioReadiness } from '../ui/state/scenarioReadiness.ts';
test('fixture readiness waits for its final task detail and loaded timeline', () => {
  // Regression: fixture auto-open replaced list nodes after agents began interacting.
  beginScenario('task-actions','target');
  assert.equal(scenarioReadiness(null)?.ready,false);
  finishScenario();
  assert.equal(scenarioReadiness({id:'other',timeline:{}})?.ready,false);
  assert.equal(scenarioReadiness({id:'target'})?.ready,false);
  assert.equal(scenarioReadiness({id:'target',timeline:{entries:[]}})?.ready,true);
  finishScenario('load failed');assert.equal(scenarioReadiness(null)?.state,'failed');
});
