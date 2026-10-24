export type TaskIntent = "send" | "interrupt" | "review";
export function taskControlPayload(agent: string, id: string, turnId: string | undefined, intent: TaskIntent, args: Record<string, unknown>, requestId: string) {
  return { op: `${agent === "codex" ? "codex" : "agent"}_${intent}`, args: {
    ...(agent === "codex" ? { threadId: id } : { agent, taskId: id }),
    ...(intent !== "send" && turnId ? { turnId } : {}),
    ...(intent === "review" ? {} : { approval: "approved" }), ...args, requestId,
  } };
}
