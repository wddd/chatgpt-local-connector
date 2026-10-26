import { DispatchSpec } from "./composites/DispatchSpec";
import { StateBadge } from "./ui";
import { statePresentation } from "./objects/statePresentation";
import { SectionHeader, EntityRow, Button, Empty, IconButton, Loading, Notice, Dialog } from "./ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Copy } from "lucide-react";
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
import TaskOwnership from "./TaskOwnership";
import { Markdown, plainMarkdown } from "./ui/Markdown";
const idOf = (r: TaskRecord) => r.taskId || r.threadId || r.task.threadId;
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
  const titleOf = (r: TaskRecord) =>
    r.task.title ||
    runtime(r)?.title ||
    r.task.prompt.split("\n")[0]?.slice(0, 90) ||
    t("taskRequest");
  const projectOf = (r: TaskRecord) =>
    r.task.project || r.task.directory || runtime(r)?.project || "";
  const projectName = (r: TaskRecord) =>
    projectOf(r).trim()
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || "";
  const stateOf = (group: (typeof groups)[number]) =>
    group.records.some((r) => r.error) ? "runtimeError" :
    group.records.some((r) => r.state === "awaiting-approval")
      ? "awaitingConfirmation"
      : runtime(group.first)?.archived
        ? "archived"
        : !runtime(group.first) || runtime(group.first)?.stale
          ? "unknown"
          : {
              waiting: "awaitingInteraction",
              active: "running",
              idle: "idle",
              systemError: "runtimeError",
            }[runtime(group.first)!.runtimeStatus] || "unknown";
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
  const time = (value: string) => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const detail = selected && (
    <Dialog
      title={titleOf(selected.first)}
      width={720}
      busy={!!busy || opening}
      onClose={closeDetail}
      footer={
        <div className="task-focus-footer">
          <span
            className="task-document-project"
            title={projectOf(selected.first)}
          >
            {projectName(selected.first)}
          </span>
          {["running", "runtimeError"].includes(stateOf(selected)) && <StateBadge variant="text" presentation={statePresentation("dispatch", stateOf(selected) === "runtimeError" ? "failed" : "running")} label={t(stateOf(selected))} />}
          {selected.first.open && !runtime(selected.first)?.archived && (
            <IconButton
              icon={ExternalLink}
              label={t("activity.open")}
              busy={opening}
              onClick={() => {
                setOpening(true);
                setActionError("");
                void openAgentTask(selected.first.agent || "codex", selected.first.open!.taskId)
                  .catch(error => setActionError(String(error)))
                  .finally(() => setOpening(false));
              }}
            />
          )}
        </div>
      }
    >
      <DispatchSpec agent={selected.first.agent || "codex"} record={{ kind: "task", value: selected.first }} />
      <div className="task-focus-content">
        <TaskOwnership ownership={runtime(selected.first)?.ownership} />
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
              <div className="actions">
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
              </div>
            )}
          </section>
        ))}
        {actionError && <Notice>{actionError}</Notice>}
      </div>
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
              <EntityRow className="task-document" data-task-id={g.id} aria-label={titleOf(g.first)} aria-haspopup="dialog" onClick={() => {
                  setSelectedId(g.id);
                  setActionError("");
                }}>
                <span className="task-document-heading">
                  <strong className="task-document-title">
                    {titleOf(g.first)}
                  </strong>
                </span>
                <span className="task-document-meta">
                  {projectName(g.first) && <span className="task-tag task-document-project" title={projectOf(g.first)}>{projectName(g.first)}</span>}
                  {stateOf(g) === "running" && <StateBadge variant="text" presentation={statePresentation("dispatch", "running")} label={t("running")} />}
                  <time dateTime={g.first.createdAt}>
                    {time(g.first.createdAt)}
                  </time>
                </span>
                {g.first.task.prompt && (
                  <span className="task-document-preview">
                    {plainMarkdown(g.first.task.prompt)}
                  </span>
                )}
              </EntityRow>
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
