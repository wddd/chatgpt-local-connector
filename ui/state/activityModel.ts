import type { AgentActivitySession, AgentActivitySnapshot, AgentInteraction } from "../types.ts";

// Activity events are complete snapshots: absent sessions have ended.
export function mergeActivity(current: AgentActivitySnapshot | undefined, next: AgentActivitySnapshot) {
  return current && Date.parse(next.observedAt) < Date.parse(current.observedAt) ? current : next;
}
export const activityLayout = { width: 232, height: 54, hold: 2000, fade: 300 };
export type TrackedActivity = AgentActivitySession & { orderAt: number; endedAt?: number };
// Freeze the start order on first observation; changing phases/headlines never moves a task.
export function trackActivity(previous: readonly TrackedActivity[], sessions: readonly AgentActivitySession[], now: number, pinnedId?: string): TrackedActivity[] {
  const old = new Map(previous.map(s => [s.id, s]));
  const live = new Set(sessions.map(s => s.id));
  return [
    ...sessions.map(s => ({ ...s, orderAt: old.get(s.id)?.orderAt ?? (Number.isFinite(Date.parse(s.startedAt ?? "")) ? Date.parse(s.startedAt!) : now) })),
    ...previous.filter(s => !live.has(s.id)).map(s => ({ ...s, interaction: undefined, endedAt: s.endedAt ?? now }))
      .filter(s => s.id === pinnedId || now < s.endedAt + activityLayout.hold + activityLayout.fade),
  ].sort((a, b) => Number(!!b.interaction) - Number(!!a.interaction) || a.orderAt - b.orderAt || a.id.localeCompare(b.id));
}
export function visibleActivity(sessions: readonly TrackedActivity[], pinnedId?: string) {
  const visible = sessions.slice(0, sessions.length > 5 ? 4 : 5);
  const pinned = sessions.find(s => s.id === pinnedId);
  if (pinned && !visible.includes(pinned)) visible[visible.length - 1] = pinned;
  return { sessions: visible, hidden: sessions.length > 5 ? sessions.length - 4 : 0,
    count: Math.min(5, sessions.length) };
}
export function interactionKey(agent: string, session: AgentActivitySession) {
  return JSON.stringify([agent, session.id, session.phaseSince, session.interaction?.respond]);
}
export type ApprovalDecision = "allow" | "deny" | "answer" | "cancel";
export type ApprovalPayload = { op: "agent_respond" | "codex_respond"; args: Record<string, unknown> };
export function permissionResponse(interaction: AgentInteraction, decision: "allow" | "deny"): ApprovalPayload | undefined {
  const { op, args } = interaction.respond;
  if (interaction.kind !== "permission" || interaction.canRespond === false || !op || !args) return;
  if (op === "codex_respond") return { op, args: { ...args, result: { decision: decision === "allow" ? "accept" : "decline" } } };
  if (args.agent === "pi") return { op, args: { ...args, confirmed: decision === "allow" } };
  const options = Array.isArray(interaction.options) ? interaction.options as { kind?: string; optionId?: string }[] : [];
  // Never silently grant a persistent permission for an Allow click.
  const option = options.find(o => o.kind === (decision === "allow" ? "allow_once" : "reject_once"));
  if (option?.optionId) return { op, args: { ...args, optionId: option.optionId } };
  if (decision === "deny") return { op, args: { ...args, cancelled: true } };
}
export interface ApprovalSubmission {
  decision: ApprovalDecision;
  payload: ApprovalPayload;
  status: "submitting" | "submitted" | "pending" | "failed" | "unconfirmed";
  error?: string;
}
export function beginApproval(previous: ApprovalSubmission | undefined, decision: ApprovalDecision,
  payload: ApprovalPayload, requestId: () => string): ApprovalSubmission | undefined {
  if (previous && (previous.decision !== decision || ["submitting", "submitted", "unconfirmed"].includes(previous.status))) return;
  return { decision, payload: previous?.payload ?? { ...payload, args: { ...payload.args, requestId: requestId() } }, status: "submitting" };
}
export function finishApproval(submission: ApprovalSubmission, receipt: { state?: string; error?: unknown; result?: { responded?: boolean; error?: unknown } }): ApprovalSubmission {
  if (receipt.state === "completed" && receipt.result?.responded !== false) return { ...submission, status: "submitted" };
  if (["pending", "running", "reserved"].includes(receipt.state ?? "")) return { ...submission, status: "pending" };
  return { ...submission, status: receipt.state === "unconfirmed" ? "unconfirmed" : "failed",
    error: typeof receipt.error === "string" ? receipt.error : JSON.stringify(receipt.error ?? receipt.result?.error ?? receipt.state ?? "Unknown response") };
}

export function questionResponse(interaction: AgentInteraction, value: string, cancelled = false): ApprovalPayload | undefined {
  const { op, args } = interaction.respond;
  if (interaction.kind !== "question" || interaction.canRespond === false || op !== "agent_respond" || args?.agent !== "pi") return;
  if (!cancelled && interaction.method === "select" && (!Array.isArray(interaction.options) || !interaction.options.includes(value))) return;
  return { op, args: { ...args, ...(cancelled ? { cancelled: true } : { value }) } };
}

// Lexical paths only: display never accesses the filesystem or changes native paths.
export function filePathParts(path: string, project?: string | null) {
  const normalize = (value: string) => {
    const slash = value.replaceAll("\\", "/");
    const root = slash.match(/^(?:[a-z]:\/|\/\/|\/)/i)?.[0] ?? "";
    const parts: string[] = [];
    for (const part of slash.slice(root.length).split("/")) {
      if (!part || part === ".") continue;
      if (part === ".." && parts.length && parts.at(-1) !== "..") parts.pop();
      else if (part !== ".." || !root) parts.push(part);
    }
    return root + parts.join("/");
  };
  const base = project ? normalize(project).replace(/\/$/, "") : "";
  const absolute = /^(?:[a-z]:[\\/]|[\\/])/i.test(path);
  const fullPath = normalize(!absolute && project ? `${project}/${path}` : path);
  const prefix = `${base}/`;
  const windows = /^[a-z]:\//i.test(fullPath) || fullPath.startsWith("//");
  const inside = !!project && (windows ? fullPath.toLowerCase().startsWith(prefix.toLowerCase()) : fullPath.startsWith(prefix));
  const displayPath = inside ? fullPath.slice(prefix.length) : fullPath;
  const split = displayPath.lastIndexOf("/") + 1;
  return { fullPath, displayPath, directory: displayPath.slice(0, split), filename: displayPath.slice(split) };
}

export function activityHeadline(session: Pick<AgentActivitySession, "headline" | "phase" | "interaction" | "project" | "fallbackHeadline" | "title">, empty = "") {
  const path = session.interaction ? session.interaction.path?.trim() || undefined : session.phase === "file" ? session.headline.trim() || undefined : undefined;
  const current = path || session.headline.trim();
  const text = current || session.fallbackHeadline?.trim() || session.title?.trim() || empty;
  return { text, path, fallback: !current, fullText: path ? filePathParts(path, session.project).fullPath : text };
}
