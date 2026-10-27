import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { useTaskQueue } from "../state/taskQueue";
import { taskErrorText } from "../state/taskErrors";
export default function TaskQueuedMessages({ queue }: { queue: ReturnType<typeof useTaskQueue> }) {
  const previous = useRef(new Map<string, string>()), [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const changes = queue.items.filter(row => previous.current.get(row.queueId) !== row.state);
    if (changes.length) setAnnouncement(changes.map(row => `${t(`detail.queueState.${row.state}`)}: ${row.preview}`).join(". "));
    previous.current = new Map(queue.items.map(row => [row.queueId, row.state]));
  }, [queue.items]);
  return <>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    {[...queue.items].reverse().filter(row => row.state !== "sent").map(row => <section className="task-queued-message flex max-w-9/10 flex-col items-end gap-1.5 self-end rounded-xl border border-dashed bg-card px-3 py-2 [&>p]:m-0 [&>p]:whitespace-pre-wrap [&>p]:wrap-anywhere [&>span]:text-xs [&>span]:text-muted-foreground" key={row.queueId} aria-label={t(`detail.queueState.${row.state}`)}>
      <p>{row.text ?? row.preview}</p><span>{t(`detail.queueState.${row.state}`)}</span>
      {!!row.error && <p role="alert">{taskErrorText(row.error, "detail.queueDeliveryFailed")}</p>}
    </section>)}
    {/* A revoked local panel identity is not an error in every observed task. */}
    {queue.error && !/\bSOURCE_REVOKED\b/.test(queue.error) && <p className="min-w-0 wrap-anywhere text-sm text-destructive" role="alert">{taskErrorText(queue.error, "detail.queueReadFailed")}</p>}
  </>;
}
