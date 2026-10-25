import { api } from "../api";
import { agentPanel, selectAgentPanel } from "./overviewPanels";
import { agentActivity } from "./activity";
import type { AgentTimeline } from "../types";

export interface TaskPanelRequest {
  agent: string; id: string;
  action?: "open" | "latest" | "follow" | "width" | "back" | "disclose";
  following?: boolean; target?: string;
}
interface Observer {
  agent: string; id: string;
  read: () => Record<string, unknown>;
  act: (request: TaskPanelRequest) => void;
}
let observer: Observer | undefined;
export function observeTaskPanel(next: Observer) {
  observer = next;
  return () => { if (observer === next) observer = undefined; };
}
export function taskPanelSnapshot() { return observer ? observer.read() : null; }
export async function controlTaskPanel(request: TaskPanelRequest) {
  if (request.action && !["open", "latest", "follow", "width", "back", "disclose"].includes(request.action)) throw new Error("TASK_PANEL_ACTION_UNSUPPORTED: use open, latest, follow, width, back, or disclose; dispatch and review use their own control-source ops");
  if (request.action === "open") {
    const timeline = await api<AgentTimeline>("agents/conversations/timeline", "POST", { agent: request.agent, id: request.id });
    const live = agentActivity.get().snapshot?.agents[request.agent]?.sessions.find(s => s.id === request.id);
    selectAgentPanel({ type: "task", agent: request.agent, session: {
      ...(live ?? { id: request.id, source: request.agent === "codex" ? "codex-thread" : "arc-task", phase: "idle", headline: "", phaseSince: null, timeline: true }),
      conversation: true, orderAt: Date.now(), ...(live ? {} : { endedAt: ["completed", "failed", "cancelled", "interrupted"].includes(timeline.status ?? "") ? Date.now() : undefined }),
    } });
    for (let i = 0; i < 120 && (observer?.id !== request.id || observer.agent !== request.agent); i++) await new Promise(requestAnimationFrame);
  }
  if (observer?.id !== request.id || observer.agent !== request.agent || agentPanel.get()?.session?.id !== request.id) throw new Error("TASK_PANEL_NOT_OPEN: use task_panel_control action:open for this task first");
  if (request.action && request.action !== "open") observer.act(request);
}
