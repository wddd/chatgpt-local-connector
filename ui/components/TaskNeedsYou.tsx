import { Button, Dialog } from "./ui";
import RequestRouting from "./RequestRouting";
import { useRequestRouting } from "../state/requestRouting";
import { useEffect, useRef, useState } from "react";
import type { AgentActivitySession, AgentTimelineEntry } from "../types";
import { t } from "../i18n";
import { activityApprovals } from "../state/activity";
import { interactionKey } from "../state/activityModel";
import { pendingSessions } from "../state/taskInteractions";
import { tasks, type TaskRecord } from "../state/tasks";
import { AdmissionRequestRow, InteractionRequestChip, LiveInteractionRequestCard } from "./objects/interaction-request";

export function taskReceipts(records: TaskRecord[], agent: string, id: string) {
  return records.filter(record => (record.agent || "codex") === agent && (record.taskId || record.threadId || record.task.threadId) === id);
}
export default function TaskNeedsYou({ agent, session, entries, source, narrow }: {
  agent: string; session: AgentActivitySession; entries: AgentTimelineEntry[]; source?: string; narrow: boolean;
}) {
  const submissions = activityApprovals.use();
  const [page, setPage] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string[]>>>({});
  const native = pendingSessions(agent, session, entries, submissions);
  const count = native.length;
  const index = Math.min(page, Math.max(0, count - 1));
  const pending = native[index];
  const identity = pending && interactionKey(agent, pending);
  const routing = useRequestRouting(agent, session.id, pending?.interaction);
  const pauseOnInteraction = (event: React.SyntheticEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.type === "focus" && !target.matches("input, textarea, [contenteditable=true]")) return;
    if (target !== event.currentTarget && !target.closest("[data-routing-controls]")) void routing.change("pause");
  };
  const focus = useRef<HTMLElement>(null);
  useEffect(() => { if (identity && (!narrow || sheetOpen)) focus.current?.focus({ preventScroll: true }); }, [identity, narrow, sheetOpen]);
  useEffect(() => { if (!count || !narrow) setSheetOpen(false); }, [count, narrow]);
  if (!count) return null;
  const interaction = pending?.interaction;
  const dock = <section ref={focus} tabIndex={-1} className="task-needs-you [&>:not(.request-card)]:shrink-0 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-warning bg-card p-3 wrap-anywhere" onFocusCapture={pauseOnInteraction} onPointerDownCapture={pauseOnInteraction} onClickCapture={pauseOnInteraction} onKeyDownCapture={pauseOnInteraction} onChangeCapture={pauseOnInteraction} aria-label={t("detail.needsYou")}>
    {pending && interaction && <LiveInteractionRequestCard key={identity} inline agent={agent} session={pending} answers={drafts[identity!] ?? {}} onAnswersChange={answers => setDrafts(old => ({ ...old, [identity!]: answers }))} pager={{ index, count, onChange: setPage }} />}
    <RequestRouting routing={routing.error ? undefined : routing.routing} source={source || t("routing.source")} busy={routing.busy} change={routing.change} />
  </section>;
  if (!narrow) return <footer className="task-detail-footer flex min-h-0 max-h-2/5 shrink flex-col items-stretch justify-start gap-2 overflow-hidden border-t bg-card p-2 @sm:max-h-3/5 @sm:p-3">{dock}</footer>;
  return <><footer className="task-detail-footer flex min-h-0 max-h-2/5 shrink flex-col items-stretch justify-start gap-2 overflow-hidden border-t bg-card p-2 @sm:max-h-3/5 @sm:p-3" onFocusCapture={pauseOnInteraction} onPointerDownCapture={pauseOnInteraction} onClickCapture={pauseOnInteraction} onKeyDownCapture={pauseOnInteraction}>{interaction && <InteractionRequestChip className="task-needs-banner h-auto min-h-13 w-full justify-between rounded-xl border border-warning px-3 py-2 text-start [&>span:first-child]:grid [&>span:first-child]:min-w-0 [&>span:first-child]:gap-1 [&_strong]:text-xs [&_strong]:text-warning [&>span:first-child>span]:truncate [&>span:first-child>span]:text-xs [&>span:last-child]:shrink-0" interaction={interaction} count={count} onOpen={() => { void routing.change("pause"); setSheetOpen(true); }} />}{!sheetOpen && <><RequestRouting routing={routing.error ? undefined : routing.routing} source={source || t("routing.source")} busy={routing.busy} change={routing.change} /></>}</footer>
    {sheetOpen && <Dialog sheet width={360} title={t("detail.needsYou")} onClose={() => setSheetOpen(false)} returnFocus=".task-needs-banner" footer={<Button variant="ghost" onClick={() => setSheetOpen(false)}>{t("detail.later")}</Button>}><div className="task-input-sheet flex min-h-0 min-w-0 flex-1 [&_.task-needs-you]:border-0 [&_.task-needs-you]:px-0 [&_.task-needs-you]:pt-1">{dock}</div></Dialog>}
  </>;
}

export function TaskReceiptHistory({ agent, id, turnId, latest }: { agent: string; id: string; turnId?: string; latest: boolean }) {
  const { records } = tasks.use();
  const rows = taskReceipts(records, agent, id).filter(record => record.approval && ["approved", "bypass", "reject"].includes(record.approval.decision) && (record.turnId ? record.turnId === turnId : latest));
  return <>{rows.map(record => <AdmissionRequestRow key={record.requestId} record={record} />)}</>;
}
