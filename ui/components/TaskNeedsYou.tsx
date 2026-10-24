import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AgentActivitySession, AgentTimelineEntry } from "../types";
import { api } from "../api";
import { t } from "../i18n";
import { activityApprovals } from "../state/activity";
import { interactionKey } from "../state/activityModel";
import { answerLabel, pendingSessions } from "../state/taskInteractions";
import { refreshTasks, tasks, type TaskRecord } from "../state/tasks";
import ActivityInteraction from "./ActivityInteraction";
import TaskQuestion from "./TaskQuestion";
import { Button, IconButton } from "./ui";

export function taskReceipts(records: TaskRecord[], agent: string, id: string) {
  return records.filter(record => (record.agent || "codex") === agent && (record.taskId || record.threadId || record.task.threadId) === id);
}
export default function TaskNeedsYou({ agent, session, entries, source, onPending }: {
  agent: string; session: AgentActivitySession; entries: AgentTimelineEntry[]; source?: string; onPending: (pending: boolean) => void;
}) {
  const submissions = activityApprovals.use();
  const { records } = tasks.use();
  const [page, setPage] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState("");
  const remembered = useRef<AgentActivitySession[]>([]);
  const native = pendingSessions(session, entries).filter(s => submissions[interactionKey(agent, s)]?.status !== "submitted");
  const receipts = taskReceipts(records, agent, session.id).filter(record => record.state === "awaiting-approval");
  const count = native.length + receipts.length;
  const index = Math.min(page, Math.max(0, count - 1));
  const pending = native[index];
  const receipt = receipts[index - native.length];
  const identity = pending ? interactionKey(agent, pending) : receipt?.requestId;
  const focus = useRef<HTMLElement>(null);
  useEffect(() => { onPending(count > 0); }, [count, onPending]);
  useEffect(() => {
    const previous = remembered.current;
    for (const old of previous) {
      const key = interactionKey(agent, old);
      if (!native.some(s => interactionKey(agent, s) === key)) {
        const submission = submissions[key];
        setResolved(submission?.status === "submitted" ? `${t("detail.byARC")} · ${answerLabel(submission.payload) || t(`activity.${submission.decision}`)}` : t("detail.resolvedElsewhere"));
      }
    }
    remembered.current = native;
  }, [agent, entries, session.interaction, submissions]);
  useEffect(() => { if (identity) focus.current?.focus({ preventScroll: true }); }, [identity]);
  const decide = async (action: string) => {
    if (!receipt || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ state?: string; error?: { message?: string } }>("tasks/decision", "POST", { requestId: receipt.requestId, action });
      if (["failed", "unconfirmed"].includes(result.state ?? "")) throw new Error(result.error?.message || result.state);
      await refreshTasks();
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  if (!count) return resolved ? <div className="task-dock-resolved" role="status">{resolved}</div> : null;
  const interaction = pending?.interaction;
  return <section ref={focus} tabIndex={-1} className="task-needs-you" aria-label={t("detail.needsYou")}>
    <header><strong>{t("detail.needsYou")}</strong><div className="actions"><IconButton icon={ChevronLeft} label={t("detail.previousRequest")} disabled={index === 0 || busy} onClick={() => setPage(index - 1)} /><span>{t("detail.pager", { current: index + 1, total: count })}</span><IconButton icon={ChevronRight} label={t("detail.nextRequest")} disabled={index === count - 1 || busy} onClick={() => setPage(index + 1)} /></div></header>
    {pending && interaction && <>
      {interaction.kind === "question" ? <TaskQuestion key={identity} agent={agent} session={pending} /> : <>
        <strong>{interaction.title || interaction.summary}</strong>
        {(interaction.command || interaction.preview || interaction.path) && <pre>{interaction.command || interaction.preview || interaction.path}</pre>}
        {interaction.cwd && <div className="mono">{t("timeline.cwd")} · {interaction.cwd}</div>}
        {interaction.reason && <p>{interaction.reason}</p>}
        <ActivityInteraction key={identity} agent={agent} session={pending} />
      </>}
    </>}
    {receipt && <><strong>{receipt.task.title || receipt.task.prompt}</strong><pre>{receipt.task.prompt}</pre>{(receipt.task.directory || receipt.task.project) && <div className="mono">{t("timeline.cwd")} · {receipt.task.directory || receipt.task.project}</div>}
      <div className="actions">{["reject", "bypass", "approve"].map(action => <Button key={action} variant={action === "approve" ? "primary" : "secondary"} disabled={busy} onClick={() => void decide(action)}>{t(`detail.${action}`)}</Button>)}</div></>}
    {error && <p role="alert">{error}</p>}
    <small>{source ? t("detail.routed", { source }) : t("detail.firstAnswer")}</small>
  </section>;
}
