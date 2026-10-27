import { DispatchSpec } from "./composites/DispatchSpec";
import { ActionGroup } from "./ui";
import { SectionHeader, Button, Empty, IconButton, Loading, Notice, Dialog } from "./ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { t } from "../i18n";
import { openAgentTask } from "../state/activity";
import { api } from "../api";
import { copyText } from "../platform";
import { displayMessage } from "../messages";
import { connector, run, notify } from "../state/connector";
import {
  tasks,
  refreshTasks,
  type TaskRecord,
  type TaskRuntime,
} from "../state/tasks";
import { useInterval } from "../state/hooks";
import { Markdown } from "./ui/Markdown";
import { TaskRow, TaskCard } from "./objects/task";
import { taskId as idOf, taskIdentity } from "./objects/task/projection";
import { taskTime as time } from "./objects/task/Row";
export default function TasksPage() {
  const { records, error, loading } = tasks.use(),
    { busy } = connector.use();
  const [runtimes, setRuntimes] = useState<Record<string, TaskRuntime>>({}),
    [selectedId, setSelectedId] = useState<string>(),
    [opening, setOpening] = useState(false),
    [actionError, setActionError] = useState("");
  const groups = useMemo(() => {
    const result = new Map<string, TaskRecord[]>();
    for (const r of records) {
      const key = idOf(r) || r.requestId;
      result.set(key, [...(result.get(key) || []), r]);
    }
    return [...result]
      .map(([id, records]) => ({
        id,
        records,
        first: records.find((r) => r.task.kind === "create") || records.at(-1)!,
      }))
      .sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt));
  }, [records]);
  const runtime = (r: TaskRecord) => runtimes[idOf(r) || ""] || r.runtime;
  const titleOf = (r: TaskRecord) => taskIdentity({ kind: "receipt", record: r, runtime: runtime(r) }).title;
  const visible = groups;
  const selected = groups.find((g) => g.id === selectedId);
  const reading = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function refreshRuntime() {
    if (reading.current) return;
    reading.current = true;
    const ids = groups
      .filter(g => !g.first.agent || g.first.agent === "codex")
      .map((g) => idOf(g.first))
      .filter((id): id is string => !!id);
    for (let i = 0; i < ids.length; i += 4)
      await Promise.all(
        ids.slice(i, i + 4).map(async (id) => {
          try {
            const next = await api<TaskRuntime>(
              `tasks/runtime/${encodeURIComponent(id)}`,
            );
            if (alive.current) setRuntimes((old) => ({ ...old, [id]: next }));
          } catch {
            if (alive.current)
              setRuntimes((old) => ({
                ...old,
                [id]: {
                  ...(old[id] || { runtimeStatus: "unknown", observedAt: "" }),
                  stale: true,
                },
              }));
          }
        }),
      );
    reading.current = false;
  }
  const ids = groups.map((g) => g.id).join(",");
  useEffect(() => {
    void refreshRuntime();
  }, [ids]);
  useInterval(() => void refreshRuntime(), 10000);
  function closeDetail() {
    const id = selectedId;
    setSelectedId(undefined);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          `[data-task-id="${CSS.escape(id || "")}"]`,
        )
        ?.focus(),
    );
  }
  const detail = selected && (
    <Dialog
      title={titleOf(selected.first)}
      width={720}
      busy={!!busy || opening}
      onClose={closeDetail}
      headerless
    >
      <TaskCard task={{ kind: "receipt", record: selected.first, runtime: runtime(selected.first), records: selected.records }}
        agent={selected.first.agent || "codex"} onClose={closeDetail} busy={!!busy || opening}
        onOpen={selected.first.open && !runtime(selected.first)?.archived ? () => {
          setOpening(true); setActionError("");
          void openAgentTask(selected.first.agent || "codex", selected.first.open!.taskId)
            .catch(error => setActionError(String(error))).finally(() => setOpening(false));
        } : undefined}>
      <div className="task-focus-content">
        {[...selected.records].reverse().map((r) => (
          <section className="task-entry" key={r.requestId}>
            <SectionHeader  level={3} title={<>
                {t(
                  {
                    create: "createTask",
                    send: "sendInput",
                    interrupt: "interruptTask",
                    native: "manageTask",
                  }[r.task.kind] || "manageTask",
                )}
              </>} actions={<><time>{time(r.createdAt)}</time>{r.task.prompt && (
                <IconButton
                  icon={Copy}
                  label={t("copyPrompt")}
                  onClick={() =>
                    void copyText(r.task.prompt)
                      .then(() => notify(t("copied")))
                      .catch(() =>
                        setActionError(
                          t("copyFailedSelectAndCopyTheTextManually"),
                        ),
                      )
                  }
                />
              )}</>} />
            <Markdown>{r.task.prompt}</Markdown>
            <p className="muted small">
              {t(
                {
                  pending: "awaitingConfirmation",
                  automatic: "automaticExecution",
                  approved: "approved",
                  bypass: "bypassed",
                  reject: "rejected",
                }[r.approval.decision] || r.approval.decision,
              )}{" "}
              · {t((r.origin ?? r.task.origin)?.ingressId === "local-cli" ? "localCli" : r.approval.source === "local" ? "local" : "cloud")}
              {" "}<DispatchSpec agent={r.agent || "codex"} record={{ kind: "task", value: r }} />
            </p>
            {r.error?.message && (
              <Notice>{displayMessage(r.error.message)}</Notice>
            )}
            {r.state === "awaiting-approval" && (
              <ActionGroup>
                {["approve", "reject"].map((action) => (
                  <Button
                    key={action}
                    variant={action === "approve" ? "primary" : "secondary"}
                    disabled={!!busy}
                    onClick={() =>
                      void run("task-decision", async () => {
                        await api("tasks/decision", "POST", {
                          requestId: r.requestId,
                          action,
                        });
                        await refreshTasks();
                      })
                    }
                  >
                    {t(action === "approve" ? "approveAndSubmit" : "reject")}
                  </Button>
                ))}
              </ActionGroup>
            )}
          </section>
        ))}
        {actionError && <Notice>{actionError}</Notice>}
      </div>
      </TaskCard>
    </Dialog>
  );
  return (
    <section className="tasks-page">
      {error && (
        <Notice
          action={
            <Button onClick={() => void refreshTasks()}>{t("retry")}</Button>
          }
        >
          {displayMessage(error)}
        </Notice>
      )}
      {loading ? (
        <Loading />
      ) : (
        <div className="task-grid">
          {visible.map((g) => (
            <div className="task-cell" key={g.id}>
              <TaskRow kind="receipt" record={g.first} runtime={runtime(g.first)} records={g.records} id={g.id} selected={g.id === selectedId}
                onOpen={() => { setSelectedId(g.id); setActionError(""); }} />
            </div>
          ))}
        </div>
      )}
      {detail}
      {!loading && !visible.length && !error && (
        <Empty>{t(groups.length ? "noMatchingTasks" : "noTasksYet")}</Empty>
      )}
    </section>
  );
}
