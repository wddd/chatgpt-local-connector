import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { tasks, type TaskRuntime } from "../state/tasks";
import { agentActivity } from "../state/activity";
import { selectAgentPanel } from "../state/overviewPanels";
import { navigation } from "../state/navigation";
import { sourceDispatches, dispatchState, isLatestDispatch } from "../state/sourceDispatch";
import { PhaseTile } from "./activity";
import { Icon, Notice } from "./ui";

export default function SourceDispatches({ ingressId, limit }: { ingressId: string; limit?: number }) {
  const { records, error } = tasks.use(), { snapshot } = agentActivity.use();
  const [runtimes, setRuntimes] = useState<Record<string, TaskRuntime>>({});
  const rows = sourceDispatches(records, ingressId).slice(0, limit);
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
  }, [ingressId, ids.join(",")]);
  return <div className="source-dispatch-list">
    <p className="timeline-meta">{t("sourcePanel.recordsScope")}</p>
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
        <span><strong>{title}</strong><span className="source-dispatch-meta">Codex · <span>{t(`sourcePanel.${state}`)}</span></span></span>
        {canOpen && <Icon icon={ChevronRight} />}
      </button>;
    })}
    {!rows.length && <p className="timeline-meta">{t("sourcePanel.noRecords")}</p>}
  </div>;
}
