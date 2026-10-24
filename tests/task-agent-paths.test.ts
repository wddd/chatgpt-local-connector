import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { within, fireEvent } from "@testing-library/dom";
import { readFile } from "node:fs/promises";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

test("task decisions and composer actions have executable agent operation arguments", async () => {
  // Regression: task detail actions were UI-only and queue/steer controls did not share discoverable agent paths.
  const window = new Window({ url: "http://localhost" });
  const media = Object.assign(new window.EventTarget(), { matches: true });
  window.matchMedia = () => media as unknown as MediaQueryList;
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment, MutationObserver: window.MutationObserver,
    HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement, HTMLSelectElement: window.HTMLSelectElement,
    Event: window.Event, CustomEvent: window.CustomEvent, CSS: window.CSS, DOMRect: window.DOMRect, localStorage: window.localStorage,
    ResizeObserver: Observer, matchMedia: window.matchMedia, getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
    cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div"); document.body.append(mount); const root = createRoot(mount);
  const beforeFetch = globalThis.fetch, calls: { op: string; args: Record<string, any> }[] = [];
  const id = "00000000-0000-4000-8000-000000000001", requestId = "00000000-0000-4000-8000-000000000002";
  let review: any, queue = [{ queueId: requestId, threadId: id, preview: "Queued input", state: "queued" }];
  globalThis.fetch = async (input, init) => {
    const route = String(input).replace("/api/", ""), body = init?.body ? JSON.parse(String(init.body)) : {};
    let result: unknown = { state: "completed" };
    if (route === "tasks/reviews") result = { reviews: review ? [{ turnId: "turn", review }] : [] };
    else if (route === "tasks") result = { records: [] };
    else if (route === "tasks/control" || route === "agents/respond") {
      if (body.op === "codex_queue") result = { items: queue };
      else {
        calls.push(body);
        if (body.op === "codex_review") review = { ...body.args, reviewer: { controlSource: "ARC" } };
        if (body.op === "task_review_undo") { review = undefined; result = { undone: true }; }
        if (body.op === "codex_queue_control") { queue = queue.map(row => ({ ...row, state: body.args.action === "promote" ? "steered" : "cancelled" })); result = { changed: 1, items: queue }; }
      }
    } else if (route === "tasks/decision") calls.push({ op: "receipt", args: body });
    return new Response(JSON.stringify(result));
  };
  try {
    const { default: TaskControls } = await server.ssrLoadModule("/ui/components/TaskControls.tsx");
    const { default: TaskOutcome } = await server.ssrLoadModule("/ui/components/TaskOutcome.tsx");
    const { default: TaskQuestion } = await server.ssrLoadModule("/ui/components/TaskQuestion.tsx");
    const { default: TaskNeedsYou } = await server.ssrLoadModule("/ui/components/TaskNeedsYou.tsx");
    const { default: TaskQueuedMessages } = await server.ssrLoadModule("/ui/components/TaskQueuedMessages.tsx");
    const { useTaskControl } = await server.ssrLoadModule("/ui/state/taskControl.ts");
    const { useTaskQueue } = await server.ssrLoadModule("/ui/state/taskQueue.ts");
    const { activityApprovals } = await server.ssrLoadModule("/ui/state/activity.ts");
    const { tasks } = await server.ssrLoadModule("/ui/state/tasks.ts");
    const { TooltipProvider } = await server.ssrLoadModule("/ui/components/ui/index.tsx");
    const { t } = await server.ssrLoadModule("/ui/i18n.ts");
    const session = { id, turnId: "turn", source: "arc-task", phase: "text", phaseSince: null, headline: "", timeline: true };
    function Controls({ state, outcome = false }: { state: string; outcome?: boolean }) {
      const control = useTaskControl("codex", id, "turn", state);
      return outcome ? h(TaskOutcome, { state, entries: [{ id: "prompt", type: "user", text: "Try again", status: "completed" }], control }) : h(TaskControls, { agent: "codex", state, control, turnId: "turn" });
    }
    function Queue() { const model = useTaskQueue("codex", id); return h(TaskQueuedMessages, { queue: model, running: true, restoreFocus() { mount.focus(); } }); }
    const render = async (node: any) => act(async () => { root.render(h(TooltipProvider, null, node)); });
    const page = within(document.body);
    const click = async (label: string) => act(async () => { fireEvent.click(page.getByRole("button", { name: label, exact: true })); });
    const type = async () => act(() => fireEvent.change(page.getByRole("textbox"), { target: { value: "Follow-up" } }));
    await render(h(Controls, { state: "running" })); await type(); await click(t("detail.send"));
    assert.equal(calls.at(-1)?.op, "codex_send"); assert.equal(calls.at(-1)?.args.sendMode, "next");
    await type();
    await act(() => fireEvent.keyDown(page.getByRole("button", { name: t("detail.sendOptions") }), { key: "Enter" }));
    await act(() => fireEvent.click(page.getByRole("menuitem", { name: t("detail.steer") })));
    assert.equal(calls.at(-1)?.args.sendMode, "steer");
    await click(t("detail.stop")); assert.equal(calls.at(-1)?.op, "codex_interrupt"); assert.equal(calls.at(-1)?.args.turnId, "turn");
    await render(h(Controls, { state: "done" })); await click(t("detail.pass")); assert.equal(calls.at(-1)?.args.verdict, "pass");
    await click(t("detail.undo")); assert.equal(calls.at(-1)?.op, "task_review_undo");
    await click(t("detail.rework")); await type(); await click(t("detail.send"));
    assert.equal(calls.at(-2)?.args.verdict, "rework"); assert.equal(calls.at(-1)?.op, "codex_send");
    for (const [state, label] of [["failed", "detail.retry"], ["interrupted", "detail.continue"]]) {
      await render(h(Controls, { state, outcome: true })); await click(t(label)); assert.equal(calls.at(-1)?.op, "codex_send");
    }
    for (const skip of [false, true]) {
      await act(() => activityApprovals.set({}));
      const interaction = { kind: "question", method: "item/tool/requestUserInput", summary: "Choice", questions: [{ id: "q", question: "Choose", options: [{ label: "A" }] }], respond: { op: "codex_respond", args: { id: "1", backendSession: id } } };
      await render(h(TaskQuestion, { agent: "codex", session: { ...session, interaction }, answers: { q: ["A"] }, onAnswersChange() {} }));
      await click(t(skip ? "detail.skip" : "detail.sendAnswer"));
      assert.equal(calls.at(-1)?.op, "codex_respond"); assert.deepEqual(calls.at(-1)?.args.result.answers.q.answers, skip ? [] : ["A"]);
    }
    for (const action of ["approve", "bypass", "reject"]) {
      await act(() => tasks.set({ records: [{ requestId, threadId: id, agent: "codex", state: "awaiting-approval", task: { prompt: "Requested work" } }], loading: false, error: "" }));
      await render(h(TaskNeedsYou, { agent: "codex", session, entries: [], onPending() {}, narrow: false })); await click(t(`detail.${action}`));
      assert.equal(calls.at(-1)?.op, "receipt"); assert.equal(calls.at(-1)?.args.action, action);
    }
    for (const [action, label] of [["promote", "detail.steer"], ["cancel", "cancel"]]) {
      await render(null); queue = queue.map(row => ({ ...row, state: "queued" }));
      await render(h(Queue)); await click(t(label));
      assert.equal(calls.at(-1)?.op, "codex_queue_control"); assert.equal(calls.at(-1)?.args.action, action);
      assert.ok(page.getByRole("status").textContent?.includes(queue[0].preview));
    }
    const catalog = JSON.parse(await readFile(new URL("../native/src/catalog.json", import.meta.url), "utf8"));
    const validator = new AjvJsonSchemaValidator();
    for (const call of calls) {
      const op = catalog.ops.find((op: any) => op.name === call.op);
      assert.ok(op, call.op); assert.equal(validator.getValidator(op.inputSchema)(call.args).valid, true, JSON.stringify(call));
    }
  } finally { await act(() => root.unmount()); globalThis.fetch = beforeFetch; await server.close(); await window.happyDOM.close(); }
});
