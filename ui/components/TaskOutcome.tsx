import { useState } from "react";
import type { AgentTimelineEntry } from "../types";
import { locale, t } from "../i18n";
import { CopyValue } from './composites/CopyValue';
import { ContextIcon } from './composites/ContextIcon';
import { RefreshCw } from 'lucide-react';
import { changedFiles } from "../state/taskProjection";
import { taskErrorText } from "../state/taskErrors";
import { EntityCard, Button, Notice } from "./ui";
import { ChangedFiles } from "./TaskChanges";

export default function TaskOutcome({ state, entries, project, onResume, onRetry, continuing }: { state: "failed" | "interrupted"; entries: AgentTimelineEntry[]; project?: string | null; onResume?: () => void; onRetry?: () => void; continuing?: boolean }) {
  const [diff, setDiff] = useState(false);
  const failure = [...entries].reverse().find(entry => entry.type === "error" || entry.status === "failed");
  const log = [failure?.command, failure?.cwd, failure?.text, failure?.output?.text].filter(Boolean).join("\n");
  const changes = changedFiles(entries);
  const diffs = entries.flatMap(entry => entry.status === "completed" ? entry.changes?.filter(change => change.diff?.text) ?? [] : []);
  const ended = [...entries].reverse().find(entry => entry.endedAt)?.endedAt;
  return <>
    {state === "interrupted" && <div className="task-stop-divider flex items-center gap-2 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-['']">{t("detail.stoppedUnknown")}{ended && ` · ${new Date(ended).toLocaleTimeString(locale.get(), { hour: "2-digit", minute: "2-digit" })}`}</div>}
    <EntityCard asChild><article className="task-outcome bg-muted text-sm leading-relaxed data-[state=failed]:border-destructive/40 data-[state=failed]:bg-danger-soft data-[state=failed]:[&>strong]:text-destructive [&_pre]:overflow-x-auto [&_pre]:font-mono [&_pre]:text-xs [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere" data-state={state} aria-label={t(state === "failed" ? "detail.turnFailed" : "detail.leftAsIs")}>
      <strong>{t(state === "failed" ? "detail.turnFailed" : "detail.leftAsIs")}</strong>
      {state === "failed" && <Notice action={onRetry && <ContextIcon icon={RefreshCw} label={t("detail.retry")} busy={continuing} onClick={onRetry} />}><CopyValue value={log} label={t("detail.copyLog")}><span>{taskErrorText(failure?.text || failure?.output?.text, "detail.failureUnknown")}</span></CopyValue>{(failure?.command || failure?.cwd || failure?.path) && <pre>{[failure.command, failure.cwd, failure.path].filter(Boolean).join("\n")}</pre>}</Notice>}
      <p>{t(changes.length ? "detail.recordedChanges" : "detail.changesUnknown")}</p>
      <ChangedFiles entries={entries} project={project} />
      {state === "interrupted" && <div className="flex flex-wrap gap-2">{onResume && <Button variant="secondary" disabled={continuing} busy={continuing} onClick={onResume}>{t("detail.resumeInterrupted")}</Button>}
        <Button variant="link" disabled={!diffs.length} aria-expanded={diff} onClick={() => setDiff(!diff)}>{t("detail.viewDiff")}</Button></div>}
      {diff && diffs.map((change, index) => <section key={index}><strong>{change.path}</strong><pre>{change.diff?.text}</pre>{change.diff?.truncated && <small>{t("timeline.truncated")}</small>}</section>)}
    </article></EntityCard>
  </>;
}
