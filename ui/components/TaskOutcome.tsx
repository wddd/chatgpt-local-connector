import { useState } from "react";
import type { AgentTimelineEntry } from "../types";
import { t } from "../i18n";
import { copyText } from "../platform";
import { changedFiles } from "../state/taskProjection";
import { Button } from "./ui";
import { ChangedFiles } from "./TaskChanges";

export default function TaskOutcome({ state, entries, project }: { state: "failed" | "interrupted"; entries: AgentTimelineEntry[]; project?: string | null }) {
  const [diff, setDiff] = useState(false), [error, setError] = useState("");
  const failure = [...entries].reverse().find(entry => entry.type === "error" || entry.status === "failed");
  const log = [failure?.command, failure?.cwd, failure?.text, failure?.output?.text].filter(Boolean).join("\n");
  const changes = changedFiles(entries);
  const diffs = entries.flatMap(entry => entry.status === "completed" ? entry.changes?.filter(change => change.diff?.text) ?? [] : []);
  const ended = [...entries].reverse().find(entry => entry.endedAt)?.endedAt;
  return <>
    {state === "interrupted" && <div className="task-stop-divider">{t("detail.stoppedUnknown")}{ended && ` · ${new Date(ended).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</div>}
    <article className="task-outcome" data-state={state}>
      <strong>{t(state === "failed" ? "detail.turnFailed" : "detail.leftAsIs")}</strong>
      {state === "failed" && <><p>{failure?.text || failure?.output?.text || t("detail.failureUnknown")}</p>{(failure?.command || failure?.cwd || failure?.path) && <pre>{[failure.command, failure.cwd, failure.path].filter(Boolean).join("\n")}</pre>}</>}
      <p>{t(changes.length ? "detail.recordedChanges" : "detail.changesUnknown")}</p>
      <ChangedFiles entries={entries} project={project} />
      <div className="actions">
      {state === "failed" ? <Button variant="ghost" disabled={!log} onClick={() => void copyText(log).catch(() => setError(t("copyFailedSelectAndCopyTheTextManually")))}>{t("detail.copyLog")}</Button>
        : <Button variant="secondary" disabled={!diffs.length} aria-expanded={diff} onClick={() => setDiff(!diff)}>{t("detail.viewDiff")}</Button>}</div>
      {diff && diffs.map((change, index) => <section key={index}><strong>{change.path}</strong><pre>{change.diff?.text}</pre>{change.diff?.truncated && <small>{t("timeline.truncated")}</small>}</section>)}
      {error && <p role="alert">{error}</p>}
    </article>
  </>;
}
