import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement as h } from "react";
import { within } from "@testing-library/dom";
import { assertNodeIdentity } from "./helpers/dom-assert.ts";

test("failed DOM identity checks report bounded diagnostics for mounted React nodes", async context => {
  // Regression: topology-render exhausted the Node heap while formatting a failed HTMLInputElement/null assertion.
  const window = new Window({ url: "http://localhost" });
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("main"); document.body.append(mount);
  const root = createRoot(mount);
  try {
    await act(() => root.render(h("section", null,
      h("input", { "aria-label": "Answer" }), h("button", null, "Submit"))));
    const page = within(mount), input = page.getByRole("textbox", { name: "Answer" });
    assertNodeIdentity(input, input);
    assertNodeIdentity(null, null);
    const before = process.memoryUsage(), started = performance.now();
    for (const expected of [null, page.getByRole("button", { name: "Submit" })]) {
      assert.throws(() => assertNodeIdentity(input, expected), error => {
        assert.ok(error instanceof assert.AssertionError);
        assert.equal(error.code, "ERR_ASSERTION");
        assert.equal(error.actual, false);
        assert.equal(error.expected, true);
        assert.ok(String(error).length < 1024);
        return true;
      });
    }
    const after = process.memoryUsage();
    assert.ok(after.heapUsed - before.heapUsed < 8 * 1024 * 1024, "failed identity checks must not expand the DOM object graph");
    context.diagnostic(JSON.stringify({ elapsedMs: performance.now() - started,
      heapGrowth: after.heapUsed - before.heapUsed, rss: after.rss }));
  } finally {
    await act(() => root.unmount());
    await window.happyDOM.close();
  }
});
