import type { AgentActivitySession, AgentActivitySnapshot, AgentInteraction } from "../types.ts";

// Activity events are complete snapshots: absent sessions have ended.
export function mergeActivity(current: AgentActivitySnapshot | undefined, next: AgentActivitySnapshot) {
  return current && Date.parse(next.observedAt) < Date.parse(current.observedAt) ? current : next;
}
export const activityLayout = { minWidth: 180, maxWidth: 220, gap: 8, nodeGap: 32, edge: 12 };
export function visibleActivity(sessions: readonly AgentActivitySession[], available: number) {
  const count = available < activityLayout.minWidth ? 0 : Math.min(3, sessions.length,
    Math.floor((available + activityLayout.gap) / (activityLayout.minWidth + activityLayout.gap)));
  const sorted = [...sessions].sort((a, b) => Number(!!b.interaction) - Number(!!a.interaction) || a.id.localeCompare(b.id));
  return { sessions: sorted.slice(0, count), hidden: Math.max(0, sessions.length - count),
    width: count ? Math.min(activityLayout.maxWidth, (available - (count - 1) * activityLayout.gap) / count) : 0 };
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
