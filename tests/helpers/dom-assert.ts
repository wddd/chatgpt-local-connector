import assert from "node:assert/strict";

// Never give AssertionError a DOM node: inspecting Happy DOM's owner document
// and React fibers can exhaust the heap before the test runner reports failure.
export function assertNodeIdentity(actual: Node | null, expected: Node | null, message = "DOM node identity differs") {
  assert.equal(actual === expected, true, message);
}
