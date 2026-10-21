import { createStore } from "./store";
import { api } from "../api";
import { isDesktop, openUrl } from "../platform";
import type { AgentActivitySession, AgentActivitySnapshot } from "../types";
import { beginApproval, finishApproval, interactionKey, mergeActivity, permissionResponse, type ApprovalDecision, type ApprovalSubmission } from "./activityModel";

export const agentActivity = createStore<{ snapshot?: AgentActivitySnapshot; error: string }>({ error: "" });
export const activityApprovals = createStore<Record<string, ApprovalSubmission>>({});
export function acceptActivity(snapshot: AgentActivitySnapshot) {
  const next = mergeActivity(agentActivity.get().snapshot, snapshot);
  if (next !== snapshot) return;
  agentActivity.set({ snapshot: next, error: "" });
  const keys = new Set(Object.entries(next.agents).flatMap(([agent, value]) => value.sessions
    .filter(session => session.interaction).map(session => interactionKey(agent, session))));
  activityApprovals.set(old => Object.fromEntries(Object.entries(old).filter(([key]) => keys.has(key))));
}
export function startAgentActivity() {
  let stopped = false, connected = false, reading = false, generation = 0;
  let off: (() => void) | undefined, stream: EventSource | undefined;
  const accept = (snapshot: AgentActivitySnapshot) => {
    if (stopped) return;
    generation++;
    acceptActivity(snapshot);
  };
  async function read() {
    if (stopped || reading) return;
    reading = true;
    const before = generation;
    try {
      const snapshot = await api<AgentActivitySnapshot>("agents/activity");
      if (!stopped && before === generation) accept(snapshot);
    } catch (error) {
      if (!stopped && before === generation) agentActivity.set(old => ({ ...old, error: String(error) }));
    } finally { reading = false; }
  }
  if (isDesktop) {
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const dispose = await listen<AgentActivitySnapshot>("agents:activity", event => accept(event.payload));
      if (stopped) dispose();
      else { off = dispose; connected = true; void read(); }
    }).catch(() => { connected = false; void read(); });
  } else if (typeof EventSource !== "undefined") {
    stream = new EventSource("/api/agents/activity/events");
    stream.onopen = () => { connected = true; };
    stream.addEventListener("snapshot", event => {
      try { accept(JSON.parse((event as MessageEvent).data)); }
      catch { void read(); }
    });
    stream.onerror = () => { connected = false; void read(); };
  }
  void read();
  const timer = setInterval(() => { if (!document.hidden && !connected) void read(); }, 5000);
  const resume = () => { if (!document.hidden) void read(); };
  document.addEventListener("visibilitychange", resume);
  return () => {
    stopped = true;
    off?.(); stream?.close(); clearInterval(timer);
    document.removeEventListener("visibilitychange", resume);
  };
}
export async function submitActivityApproval(agent: string, session: AgentActivitySession, decision: ApprovalDecision) {
  if (!session.interaction) return;
  const key = interactionKey(agent, session), payload = permissionResponse(session.interaction, decision);
  if (!payload) return;
  const submission = beginApproval(activityApprovals.get()[key], decision, payload, () => crypto.randomUUID());
  if (!submission) return;
  activityApprovals.set(old => ({ ...old, [key]: submission }));
  const finish = (next: ApprovalSubmission) => activityApprovals.set(old => old[key] === submission ? { ...old, [key]: next } : old);
  try {
    finish(finishApproval(submission, await api("agents/respond", "POST", submission.payload)));
  } catch (error) { finish({ ...submission, status: "failed", error: String(error) }); }
}
// 2C can supply the timeline opener without changing native-entry fallback.
export async function openActivitySession(agent: string, session: AgentActivitySession,
  openTimeline?: (session: AgentActivitySession) => void) {
  if (session.timeline && openTimeline) { openTimeline(session); return; }
  if (session.open?.kind === "url") await openUrl(session.open.target);
  else if (session.open?.kind === "agent-session")
    await api(`agents/sessions/${encodeURIComponent(session.open.target)}/open`, "POST", { agent });
}
