import { useEffect, useState } from "react";
import { api } from "../api";
export interface QueuedMessage { queueId: string; threadId: string; preview: string; text?: string; state: string; reason?: string; error?: unknown; }
export function useTaskQueue(agent: string, id: string, revision?: unknown) {
  const [items, setItems] = useState<QueuedMessage[]>([]), [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();
  const read = async () => {
    const result = await api<{ items: QueuedMessage[] }>("tasks/control", "POST", { op: "codex_queue", args: { threadId: id } });
    return result.items;
  };
  useEffect(() => {
    if (agent !== "codex") return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await read(); if (!stopped) { setItems(next); setError(""); } }
      catch (e) { if (!stopped) setError(String(e)); }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [agent, id, revision]);
  const act = async (queueId: string, action: "cancel" | "promote") => {
    if (busy) return;
    setBusy(queueId); setError("");
    try {
      await api("tasks/control", "POST", { op: "codex_queue_control", args: { threadId: id, queueId, action } });
      setItems(await read());
    } catch (e) { setError(String(e)); } finally { setBusy(undefined); }
  };
  return { items, error, busy, act };
}
