import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { useTaskQueue } from "../state/taskQueue";
import { Button } from "./ui";
export default function TaskQueuedMessages({ queue, running, restoreFocus }: { queue: ReturnType<typeof useTaskQueue>; running: boolean; restoreFocus: () => void }) {
  const previous = useRef(new Map<string, string>()), [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const changes = queue.items.filter(row => previous.current.get(row.queueId) !== row.state);
    if (changes.length) setAnnouncement(changes.map(row => `${t(`detail.queueState.${row.state}`)}: ${row.preview}`).join(". "));
    previous.current = new Map(queue.items.map(row => [row.queueId, row.state]));
  }, [queue.items]);
  return <>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    {[...queue.items].reverse().filter(row => row.state !== "sent").map(row => <section className="task-queued-message" key={row.queueId} aria-label={t(`detail.queueState.${row.state}`)}>
      <p>{row.text ?? row.preview}</p><span>{t(`detail.queueState.${row.state}`)}</span>
      {["queued", "blocked"].includes(row.state) && <div className="actions">
        <Button variant="secondary" disabled={!running || !!queue.busy} onClick={() => { restoreFocus(); void queue.act(row.queueId, "promote"); }}>{t("detail.steer")}</Button>
        <Button variant="ghost" disabled={!!queue.busy} onClick={() => { restoreFocus(); void queue.act(row.queueId, "cancel"); }}>{t("cancel")}</Button>
      </div>}
      {!!row.error && <p role="alert">{typeof row.error === "string" ? row.error : JSON.stringify(row.error)}</p>}
    </section>)}
    {queue.error && <p role="alert">{queue.error}</p>}
  </>;
}
