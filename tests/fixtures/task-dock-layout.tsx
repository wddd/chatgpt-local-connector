import "../../ui/style.css";
import { createRoot } from "react-dom/client";
import ActivityTimeline from "../../ui/components/ActivityTimeline";
import { Dialog, TooltipProvider } from "../../ui/components/ui";
import { agentActivity } from "../../ui/state/activity";
import { locale } from "../../ui/i18n";
import type { AgentTimeline, AgentInteraction } from "../../ui/types";
import type { TrackedActivity } from "../../ui/state/activityModel";
import "../../ui/product.css";

const root = createRoot(document.getElementById("fixture")!);
locale.set("en");
document.documentElement.dataset.reducedMotion = String(matchMedia("(prefers-reduced-motion: reduce)").matches);
let timeline: AgentTimeline;
window.fetch = async input => {
  const path = String(input).replace("/api/", "");
  if (path.startsWith("agents/timeline/")) return Response.json(timeline);
  if (path.startsWith("tasks/runtime/")) return Response.json({ title: "Pending question" });
  if (path === "tasks") return Response.json({ records: [] });
  if (path === "tasks/presence") return Response.json({});
  if (path === "tasks/request-routing") return Response.json({ routing: { state: "not-routable", deferUntil: null, pausedBy: null, reason: "fixture" } });
  throw new Error(`Unexpected layout fixture request: ${path}`);
};

let revision = 0;
(window as typeof window & { mountTaskDock: (width: number, options: number) => void }).mountTaskDock = (width, options) => {
  const interaction: AgentInteraction | undefined = options < 0 ? { kind: "permission", summary: "Approval preview fixture", method: "item/commandExecution/requestApproval",
    preview: Array.from({ length: 60 }, (_, index) => `Preview line ${index + 1}: inspect sample configuration and retain the documented defaults.`).join("\n"),
    canRespond: true, respond: { via: "act", op: "codex_respond", args: { id: "fixture-approval" } } } : options ? { kind: "question", summary: "Choose a route after reviewing the complete sample verification plan and each option description.", method: "request_user_input_async",
    options: Array.from({ length: options }, (_, index) => ({ label: `Route ${index + 1}`, description: "Keep this description visible with the corresponding option." })),
    respond: { via: "act", op: "codex_respond", args: { id: "fixture-question" } } } : undefined;
  const session: TrackedActivity = { id: "dock-layout", title: "Pending question", source: "arc-task", phase: interaction ? "interaction" : "text",
    phaseSince: null, headline: "", orderAt: 0, timeline: true, turnId: "turn", interaction };
  timeline = { sessionId: session.id, status: "running", cursor: 1, coverage: { state: "complete", truncated: false }, executionEvidence: true, entries: [
    { id: "message", type: "user", text: "Review the pending question", turnId: "turn", status: "completed", startedAt: null, updatedAt: "", cursor: 1 },
    ...(interaction ? [{ id: "question", type: "interaction" as const, interaction, turnId: "turn", status: "pending" as const, startedAt: null, updatedAt: "", cursor: 1 }] : []),
  ] };
  agentActivity.set({ error: "", snapshot: { observedAt: "", activeAgents: ["codex"], agents: { codex: { sessions: [session] } } } });
  root.render(<TooltipProvider><Dialog key={++revision} width={width} dock="right" headerless title="Task layout fixture" onClose={() => {}}>
    <div className="agent-panel-view"><ActivityTimeline agent="codex" session={session} expanded={false} onToggleWidth={() => {}} onBack={() => {}} /></div>
  </Dialog></TooltipProvider>);
};
