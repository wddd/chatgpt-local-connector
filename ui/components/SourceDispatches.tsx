import { Notice, Tag } from "./ui";
import { useAppNow } from "../state/appEnvironment";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { tasks, type TaskRuntime } from "../state/tasks";
import { agentActivity } from "../state/activity";
import { selectAgentPanel } from "../state/overviewPanels";
import { navigation } from "../state/navigation";
import { sourceDispatches, dispatchState, isLatestDispatch } from "../state/sourceDispatch";
import { TaskRow } from "./objects/task";

export default function SourceDispatches({ sourceId, summary = false }: { sourceId: string; summary?: boolean }) {
  const now = useAppNow(60_000);
  const { records, error } = tasks.use(), { snapshot } = agentActivity.use();
  const [runtimes, setRuntimes] = useState<Record<string, TaskRuntime>>({});
  const [visible, setVisible] = useState(8);
  const more = useRef<HTMLDivElement>(null);
  const stateOf = (record: typeof records[number]) => {
    const id = record.threadId || record.task.threadId;
    const latest = isLatestDispatch(record, records);
    return dispatchState(record, latest && id ? runtimes[id] ?? record.runtime : undefined, latest ? snapshot?.agents.codex?.sessions.find(s => s.id === id) : undefined);
  };
  const dispatches = sourceDispatches(records, sourceId).sort((a, b) => Number(stateOf(b) === 'pending') - Number(stateOf(a) === 'pending'));
  const rows = dispatches.slice(0, visible);
  useEffect(() => {
    const marker = more.current;
    if (!marker || visible >= dispatches.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(count => count + 8);
    }, { root: marker.closest(".side-panel-scroll, .workspace"), rootMargin: "0px 0px 120px 0px" });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [visible, dispatches.length]);
  const ids = [...new Set(rows.filter(r => isLatestDispatch(r, records)).map(r => r.threadId || r.task.threadId).filter((id): id is string => !!id))];
  useEffect(() => {
    let stopped = false, reading = false;
    setRuntimes({});
    const read = async () => {
      if (reading || document.hidden) return;
      reading = true;
      for (let i = 0; i < ids.length && !stopped; i += 4) await Promise.all(ids.slice(i, i + 4).map(async id => {
        try {
          const runtime = await api<TaskRuntime>(`tasks/runtime/${encodeURIComponent(id)}`);
          if (!stopped) setRuntimes(old => ({ ...old, [id]: runtime }));
        } catch {
          if (!stopped) setRuntimes(old => ({ ...old, [id]: { runtimeStatus: "unknown", observedAt: "", stale: true } }));
        }
      }));
      reading = false;
    };
    void read(); const timer = setInterval(() => void read(), 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [sourceId, ids.slice().sort().join(",")]);
  return <div className="source-dispatch-list grid gap-2">
    {summary && <div className="account-chips flex flex-wrap items-center gap-1.5">{['pending', 'running', 'today'].map(state => <Tag key={state}>{t(`accounts.count.${state}`, { count: dispatches.filter(record => state === 'today' ? new Date(record.createdAt).toDateString() === new Date(now).toDateString() : stateOf(record) === state).length })}</Tag>)}</div>}
    {error && <Notice>{error}</Notice>}
    {rows.map(record => {
      const id = record.threadId || record.task.threadId;
      const latest = isLatestDispatch(record, records);
      const live = latest ? snapshot?.agents.codex?.sessions.find(s => s.id === id) : undefined;
      const runtime = latest && id ? runtimes[id] ?? record.runtime : undefined;
      return <TaskRow kind="dispatch" key={record.requestId} record={record} runtime={runtime} live={live} onOpen={session => {
        selectAgentPanel({ type: "task", agent: "codex", session });
        navigation.set(old => ({ ...old, page: "overview" }));
      }} />;
    })}
    {!rows.length && <p className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("sourcePanel.noRecords")}</p>}
    {visible < dispatches.length && <div ref={more} className="source-dispatch-more h-px" aria-hidden="true" />}
  </div>;
}
