import test from "node:test";
import assert from "node:assert/strict";
import { mergeActivity, visibleActivity, beginApproval, finishApproval, permissionResponse, interactionKey } from "../ui/state/activityModel.ts";
import type { AgentActivitySession, AgentActivitySnapshot, AgentInteraction } from "../ui/types.ts";
const permission: AgentInteraction = { kind: "permission", summary: "Run example command", respond: { via: "act", op: "agent_respond", args: { agent: "claude", taskId: "task-example", interactionId: 1 } }, options: [{ kind: "allow_once", optionId: "yes" }, { kind: "reject_once", optionId: "no" }] };
function session(id: string, interaction?: AgentInteraction): AgentActivitySession {
  return { id, source: "arc-task", phase: interaction ? "interaction" : "command", phaseSince: "2026-01-01T00:00:00Z", headline: "printf example", timeline: true, interaction };
}
function snapshot(at: number, sessions: AgentActivitySession[]): AgentActivitySnapshot {
  return { observedAt: `2026-01-01T00:00:0${at}Z`, activeAgents: [], agents: { claude: { sessions } } };
}
test("full snapshots update sessions, remove completed ones and reject older observations", () => {
  const first = snapshot(1, [session("one"), session("two")]);
  const next = snapshot(2, [session("two", permission)]);
  assert.equal(mergeActivity(undefined, first), first);
  assert.equal(mergeActivity(first, next), next);
  assert.equal(mergeActivity(next, first), next);
  assert.equal(mergeActivity(next, snapshot(3, [])).agents.claude.sessions.length, 0);
});
test("attention sorts first; at most three bubbles with exact overflow and stable identity order", () => {
  const sessions = [session("e"), session("d"), session("c"), session("b", permission), session("a", permission)];
  const shown = visibleActivity(sessions, 1000);
  assert.deepEqual(shown.sessions.map(s => s.id), ["a", "b", "c"]);
  assert.equal(shown.hidden, 2);
  assert.equal(shown.width, 220);
  assert.equal(sessions[0].id, "e");
});
test("narrow widths hide all bubbles; exact thresholds respect minimum width and gaps", () => {
  const sessions = [session("one"), session("two"), session("three")];
  for (const available of [-30, 0, 179]) assert.equal(visibleActivity(sessions, available).sessions.length, 0);
  assert.equal(visibleActivity(sessions, 180).sessions.length, 1);
  assert.equal(visibleActivity(sessions, 367).sessions.length, 1);
  assert.equal(visibleActivity(sessions, 368).sessions.length, 2);
  assert.equal(visibleActivity(sessions, 556).sessions.length, 3);
  assert.equal(visibleActivity(sessions, 180).hidden, 2);
  assert.equal(visibleActivity([session("one")], 1000).width, 220);
  assert.equal(visibleActivity([], 1000).width, 0);
});
test("approvals use ACP single-use choices, Pi confirmation and Codex decisions; questions do not submit", () => {
  assert.equal(permissionResponse(permission, "allow")?.args.optionId, "yes");
  assert.equal(permissionResponse(permission, "deny")?.args.optionId, "no");
  assert.equal(permissionResponse({ ...permission, options: [{ kind: "allow_always", optionId: "always" }] }, "allow"), undefined);
  assert.equal(permissionResponse({ ...permission, options: [] }, "deny")?.args.cancelled, true);
  assert.equal(permissionResponse({ ...permission, respond: { op: "agent_respond", args: { agent: "pi" } } }, "allow")?.args.confirmed, true);
  assert.deepEqual(permissionResponse({ ...permission, respond: { op: "codex_respond", args: { id: "interaction" } } }, "deny")?.args.result, { decision: "decline" });
  assert.equal(permissionResponse({ ...permission, kind: "question" }, "allow"), undefined);
  assert.equal(permissionResponse({ ...permission, canRespond: false }, "allow"), undefined);
});
test("submission locks immediately, survives snapshot refresh and retries only the identical UUID/payload", () => {
  const payload = permissionResponse(permission, "allow")!;
  let ids = 0;
  const first = beginApproval(undefined, "allow", payload, () => `request-${++ids}`)!;
  assert.equal(first.status, "submitting");
  assert.equal(beginApproval(first, "allow", payload, () => "unused"), undefined);
  const failed = finishApproval(first, { state: "failed", error: "connection lost" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "connection lost");
  assert.equal(beginApproval(failed, "deny", payload, () => "unused"), undefined);
  const retry = beginApproval(failed, "allow", payload, () => `request-${++ids}`)!;
  assert.equal(retry.payload, first.payload);
  assert.equal(ids, 1);
  const pending = finishApproval(retry, { state: "pending" });
  assert.equal(pending.status, "pending");
  assert.equal(beginApproval(pending, "allow", payload, () => "unused")?.payload, first.payload);
  assert.equal(beginApproval(finishApproval(retry, { state: "completed" }), "allow", payload, () => "unused"), undefined);
  assert.equal(beginApproval(finishApproval(retry, { state: "unconfirmed" }), "allow", payload, () => "unused"), undefined);
  const s = session("task", permission);
  assert.equal(interactionKey("claude", s), interactionKey("claude", { ...s, headline: "updated summary" }));
  assert.notEqual(interactionKey("claude", s), interactionKey("claude", { ...s, phaseSince: "2026-01-01T00:00:01Z" }));
});
