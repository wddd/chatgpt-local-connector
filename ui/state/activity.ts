import { useEffect, useRef, useState } from "react";
import { createStore } from "./store";
import { api } from "../api";
import { isDesktop, openUrl } from "../platform";
import type { AgentActivitySession, AgentActivitySnapshot } from "../types";
import { trackActivity, activityLayout, type TrackedActivity, beginApproval, finishApproval, interactionKey, mergeActivity, permissionResponse, type ApprovalDecision, type ApprovalSubmission } from "./activityModel";

export const agentActivity = createStore<{ snapshot?: AgentActivitySnapshot; error: string }>({ error: "" });
export const activityTimeline = createStore<{ agent: string; session: AgentActivitySession } | undefined>(undefined);
export const activityApprovals = createStore<Record<string, ApprovalSubmission>>({});
export function acceptActivity(snapshot: AgentActivitySnapshot) {
  const next = mergeActivity(agentActivity.get().snapshot, snapshot);
  if (next !== snapshot) return;
  agentActivity.set({ snapshot: next, error: "" });
  const keys = new Set(Object.entries(next.agents).flatMap(([agent, value]) => value.sessions
    .filter(session => session.interaction).map(session => interactionKey(agent, session))));
  const retained = activityTimeline.get();
  activityApprovals.set(old => Object.fromEntries(Object.entries(old).filter(([key]) => {
    const [agent, id] = JSON.parse(key);
    return keys.has(key) || (retained && retained.agent === agent && retained.session.id === id);
  })));
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
export async function submitActivityApproval(agent: string, session: AgentActivitySession, decision: "allow" | "deny") {
  if (!session.interaction) return;
  const payload = permissionResponse(session.interaction, decision);
  if (!payload) return;
  return submitActivityResponse(agent, session, decision, payload);
}
export async function submitActivityResponse(agent: string, session: AgentActivitySession, decision: ApprovalDecision,
  payload: import("./activityModel").ApprovalPayload) {
  const key = interactionKey(agent, session);
  const submission = beginApproval(activityApprovals.get()[key], decision, payload, () => crypto.randomUUID());
  if (!submission) return;
  activityApprovals.set(old => ({ ...old, [key]: submission }));
  const finish = (next: ApprovalSubmission) => activityApprovals.set(old => old[key] === submission ? { ...old, [key]: next } : old);
  try {
    finish(finishApproval(submission, await api("agents/respond", "POST", submission.payload)));
  } catch (error) { finish({ ...submission, status: "failed", error: String(error) }); }
}
// Timeline and native entry use the same session identity.
export async function openActivitySession(agent: string, session: AgentActivitySession,
  openTimeline?: (session: AgentActivitySession) => void) {
  if (session.timeline && openTimeline) { openTimeline(session); return; }
  if (session.open?.kind === "url") await openUrl(session.open.target);
  else if (session.open?.kind === "agent-session")
    await api(`agents/sessions/${encodeURIComponent(session.open.target)}/open`, "POST", { agent });
}

// Presentation-only lifetime: the native snapshot and timeline contracts stay unchanged.
export function useActivityTracking() {
  const { snapshot } = agentActivity.use();
  const selected = activityTimeline.use(), previousSelection = useRef(selected);
  const [tracked, setTracked] = useState<Record<string, TrackedActivity[]>>({});
  useEffect(() => {
    if (!snapshot) return;
    setTracked(old => Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(snapshot.agents)])]
      .map(agent => [agent, trackActivity(old[agent] ?? [], snapshot.agents[agent]?.sessions ?? [], Date.now(), selected?.agent === agent ? selected.session.id : undefined)])));
  }, [snapshot]);
  useEffect(() => {
    const previous = previousSelection.current;
    previousSelection.current = selected;
    // Keep the selected origin and its branch until dismissal can restore focus.
    if (previous && previous !== selected) setTracked(old => ({ ...old, [previous.agent]: (old[previous.agent] ?? []).map(s =>
      s.id === previous.session.id && s.endedAt !== undefined ? { ...s, endedAt: Date.now() } : s) }));
  }, [selected]);
  useEffect(() => {
    const pinned = (agent: string, id: string) => selected?.agent === agent && selected.session.id === id;
    const ends = Object.entries(tracked).flatMap(([agent, sessions]) => sessions.flatMap(s => s.endedAt === undefined || pinned(agent, s.id) ? [] : [s.endedAt + activityLayout.hold + activityLayout.fade]));
    if (!ends.length) return;
    const timer = setTimeout(() => setTracked(old => Object.fromEntries(Object.entries(old).map(([agent, sessions]) =>
      [agent, sessions.filter(s => s.endedAt === undefined || pinned(agent, s.id) || Date.now() < s.endedAt + activityLayout.hold + activityLayout.fade)]))),
      Math.max(0, Math.min(...ends) - Date.now()));
    return () => clearTimeout(timer);
  }, [tracked, selected]);
  return tracked;
}
