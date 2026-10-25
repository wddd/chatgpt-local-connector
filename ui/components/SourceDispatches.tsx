import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { tasks, type TaskRuntime } from "../state/tasks";
import { agentActivity } from "../state/activity";
import { selectAgentPanel } from "../state/overviewPanels";
import { navigation } from "../state/navigation";
import { sourceDispatches, dispatchState, isLatestDispatch } from "../state/sourceDispatch";
import { PhaseTile } from "./activity";
import { Icon, Notice, Tag } from "./ui";

export default function SourceDispatches({ sourceId, summary = false }: { sourceId: string; summary?: boolean }) {
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
  return <div className="source-dispatch-list">
    {summary && <div className="account-chips">{['pending', 'running', 'today'].map(state => <Tag key={state}>{t(`accounts.count.${state}`, { count: dispatches.filter(record => state === 'today' ? new Date(record.createdAt).toDateString() === new Date().toDateString() : stateOf(record) === state).length })}</Tag>)}</div>}
    {error && <Notice>{error}</Notice>}
    {rows.map(record => {
      const id = record.threadId || record.task.threadId;
      const latest = isLatestDispatch(record, records);
      const live = latest ? snapshot?.agents.codex?.sessions.find(s => s.id === id) : undefined;
      const runtime = latest && id ? runtimes[id] ?? record.runtime : undefined;
      const state = dispatchState(record, runtime, live);
      const title = record.task.title || live?.title || runtime?.title || record.task.prompt.split("\n")[0] || t("taskRequest");
      const phase = state === "pending" ? "interaction" : state === "running" ? live?.phase ?? "thinking" : "idle";
      const canOpen = !!id && (state === "running" || state === "pending") && (live || runtime && !runtime.stale);
      return <button key={record.requestId} className="source-dispatch-row" disabled={!canOpen} data-state={state} onClick={() => {
        if (!id || !canOpen) return;
        selectAgentPanel({ type: "task", agent: "codex", session: live ? { ...live, orderAt: Date.parse(record.createdAt) } : {
          id, source: "codex-thread", title, phase, headline: title, phaseSince: null, timeline: true,
          project: record.task.project || record.task.directory, startedAt: record.createdAt, orderAt: Date.parse(record.createdAt),
        } });
        navigation.set(old => ({ ...old, page: "overview" }));
      }}>
        <PhaseTile phase={phase} completed={state === "completed"} animated={false} />
        <span><strong>{title}</strong><span className="source-dispatch-meta">{record.agent ?? "Codex"} · <span>{t(`sourcePanel.${state}`)}</span></span></span>
        {canOpen && <Icon icon={ChevronRight} />}
      </button>;
    })}
    {!rows.length && <p className="timeline-meta">{t("sourcePanel.noRecords")}</p>}
    {visible < dispatches.length && <div ref={more} className="source-dispatch-more" aria-hidden="true" />}
  </div>;
}
