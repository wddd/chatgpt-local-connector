import { Card } from "./ui/card";
import { LiveInteractionRequestRow } from './objects/interaction-request';
import { SectionHeader, Button, Icon, IconButton, PlatformIcon } from "./ui";
import { TaskReceiptHistory } from "./TaskNeedsYou";
import { ChangedFiles } from "./TaskChanges";
import TaskOutcome from "./TaskOutcome";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Brain, Copy, Check, ChevronRight, Circle, FileText, ListChecks, MessageSquare, ShieldAlert, Terminal, UserRound, Wrench } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { AnimatePresence, motion } from "motion/react";
import { locale, t } from "../i18n";
import { useReducedMotion } from "../state/appEnvironment";
import type { AgentActivitySession, AgentTimelineEntry, DispatchSummary, TurnTiming } from "../types";
import { filePathParts } from "../state/activityModel";
import { timelineGroups, turnDuration } from "../state/timelineGroups";
import { dispatchSourceLabel } from "./activity";
import { copyText } from "../platform";
import { processOpen, projectTurn, taskState, toolCounts, type ProcessRow } from "../state/taskProjection";
import { taskErrorText } from "../state/taskErrors";
import FilePath from "./FilePath";
import TimelineMarkdown, { TimelineResources } from "./TimelineMarkdown";

const stepIcons = { command: Terminal, file: FileText, tool: Wrench, thinking: Brain, text: MessageSquare, user: UserRound, plan: ListChecks, interaction: ShieldAlert, error: AlertCircle };
export function durationText(value: number) {
  if (value < 1000) return t("activity.milliseconds", { count: Math.floor(value) });
  const seconds = Math.floor(value / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return t(hours ? "timeline.durationHours" : minutes ? "timeline.durationMinutes" : "activity.seconds",
    { hours, minutes: minutes % 60, seconds: seconds % 60, count: seconds });
}
function Duration({ value }: { value?: number }) {
  return value === undefined ? null : <time>{durationText(value)}</time>;
}
function Fold({ open, onChange, summary, children, className = "", expandable = true }: {
  open: boolean; onChange: (open: boolean) => void; summary: ReactNode; children: ReactNode; className?: string; expandable?: boolean;
}) {
  const reduced = useReducedMotion();
  if (!expandable) return <div className={`timeline-fold min-w-0 ${className}`}><div className="timeline-summary flex h-auto min-h-8 w-full min-w-0 items-center justify-start gap-2 rounded-md px-1 py-1.5 text-start text-inherit [&[data-state=open]>.timeline-chevron]:rotate-90">{summary}</div></div>;
  return <Collapsible open={open} onOpenChange={onChange} className={`timeline-fold min-w-0 ${className}`}>
    <CollapsibleTrigger asChild><Button variant="ghost" className="timeline-summary flex h-auto min-h-8 w-full min-w-0 items-center justify-start gap-2 rounded-md px-1 py-1.5 text-start text-inherit [&[data-state=open]>.timeline-chevron]:rotate-90" type="button">
      {summary}<Icon icon={ChevronRight} className="timeline-chevron shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none [[data-reduced-motion=true]_&]:transition-none" />
    </Button></CollapsibleTrigger>
    {reduced ? open && <CollapsibleContent className="timeline-fold-content overflow-hidden">{children}</CollapsibleContent> : <AnimatePresence initial={false}>
      {open && <CollapsibleContent forceMount asChild>
        <motion.div className="timeline-fold-content overflow-hidden" initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [.34, 1.56, .64, 1] }}>
          {children}
        </motion.div>
      </CollapsibleContent>}
    </AnimatePresence>}
  </Collapsible>;
}
function UserMessage({ text, truncated, open, onChange }: { text: string; truncated?: boolean; open: boolean; onChange: (open: boolean) => void }) {
  const id = useId(), content = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => {
      if (node.clientWidth) setOverflow(node.scrollHeight > node.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);
  return <article className="timeline-text min-w-0 text-sm wrap-anywhere timeline-user ml-auto w-fit max-w-9/10 self-end rounded-xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground @sm:max-w-5/6" aria-label={t("timeline.user")}>
    <div id={id} className="timeline-user-content relative">
      <div ref={content} className="timeline-user-preview line-clamp-2 leading-relaxed wrap-anywhere data-[expanded]:invisible data-[expanded]:absolute data-[expanded]:inset-x-0 data-[expanded]:top-0 data-[expanded]:pointer-events-none" data-expanded={open || undefined} aria-hidden={open || undefined}>{text}</div>
      {open && <TimelineMarkdown text={text} />}
      {truncated && <span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.truncated")}</span>}
    </div>
    {overflow && <Button variant="ghost" className="timeline-user-toggle mt-1 min-h-7 bg-transparent px-0 py-1 text-xs text-inherit hover:bg-transparent" aria-expanded={open} aria-controls={id} onClick={() => onChange(!open)}>
      {t(open ? "timeline.showLess" : "timeline.showMore")}
    </Button>}
  </article>;
}
function ToolTitle({ entry, project }: { entry: AgentTimelineEntry; project?: string | null }) {
  return <span className="timeline-entry-title min-w-0 flex-1 truncate [&_.file-path-name]:max-w-full [&_.file-path-name]:truncate mono font-mono" title={entry.command || entry.path || entry.title}>
    {entry.path && !entry.command ? <FilePath path={entry.path} project={project || entry.cwd} /> : entry.command || entry.title || t(entry.type === "command" ? "activity.phase.command" : entry.type === "file" ? "activity.phase.file" : "activity.phase.tool")}
  </span>;
}
function ToolDetails({ entry, project }: { entry: AgentTimelineEntry; project?: string | null }) {
  return <div className="timeline-output grid min-w-0 gap-2 py-2 pl-6 pr-1.5 text-xs wrap-anywhere [&_section]:min-w-0 [&_pre]:mt-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere">
    {entry.cwd && <section><span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.cwd")}</span><div className="mono font-mono">{entry.cwd}</div></section>}
    {entry.path && <section><span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.path")}</span><div className="mono font-mono">{filePathParts(entry.path, project || entry.cwd).fullPath}</div></section>}
    {!!entry.changes?.length && <section><span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.changes")}</span><ul className="timeline-files m-0 mt-1 grid min-w-0 list-none gap-1 overflow-x-auto p-0">{entry.changes.map((change, index) => <li key={`${change.path}:${index}`}>
      <FilePath path={change.path} project={project || entry.cwd} />
    </li>)}</ul></section>}
    {entry.input?.text && <section><span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.input")}</span><pre>{entry.input.text}</pre></section>}
    {(entry.output?.text || entry.text) && <section><span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.output")}</span><pre>{entry.output?.text || entry.text}</pre></section>}
    {entry.exitCode !== undefined && <div className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.exitCode", { code: entry.exitCode })}</div>}
    {(entry.truncated || entry.input?.truncated || entry.output?.truncated) && <span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.truncated")}</span>}
  </div>;
}
function CopyReply({ text }: { text: string }) {
  const [error, setError] = useState("");
  return <><IconButton icon={Copy} label={t("detail.copyReply")} onClick={() => void copyText(text).catch(() => setError(t("copyFailedSelectAndCopyTheTextManually")))} />{error && <span role="alert">{error}</span>}</>;
}
function ProcessEntry({ entry, agent, session }: { entry: AgentTimelineEntry; agent: string; session: AgentActivitySession }) {
  if (entry.type === "text") return <article className="task-phase flex min-w-0 gap-2 text-sm leading-relaxed text-foreground"><span className="task-agent-mark hidden size-6 shrink-0 place-items-center rounded-md bg-task-live-soft text-brand-accent @sm:grid" aria-label={agent}><PlatformIcon role="agent" platform={agent} size={16} /></span><TimelineMarkdown text={entry.text ?? ""} /></article>;
  if (entry.type === "user") return <div className="task-prompt m-0 flex min-w-0 flex-col items-end gap-1 [&>small]:text-xs [&>small]:text-muted-foreground">{entry.controlSource && <small>{t("detail.via", { source: dispatchSourceLabel(entry.controlSource) })}{entry.startedAt && ` · ${new Date(entry.startedAt).toLocaleTimeString(locale.get(), { hour: "2-digit", minute: "2-digit" })}`}</small>}<TimelineMarkdown text={entry.text ?? ""} /></div>;
  if (entry.type === "interaction") return <LiveInteractionRequestRow entry={entry} agent={agent} session={session} />;
  if (entry.type === "plan") return <Card asChild className="gap-0 p-3"><section className="task-plan text-sm" aria-label={t("timeline.plan")}>
    <strong className="text-xs text-muted-foreground">{t("timeline.plan")}</strong>
    <ul className="mt-2 grid list-none gap-2 p-0">{entry.plan?.map((step, index) => <li key={index} data-state={step.status}
      className={`flex gap-2 ${["in_progress", "inProgress", "running"].includes(step.status) ? "font-semibold text-brand-accent" : "text-muted-foreground"}`}>
      <Icon icon={step.status === "completed" ? Check : Circle} className={step.status === "completed" ? "text-success" : undefined} />
      <span className={step.status === "completed" ? "line-through" : undefined}>{step.content.text}</span>
    </li>)}</ul>
  </section></Card>;
  return <p className="timeline-error rounded-md bg-destructive/10 p-1 text-destructive">{taskErrorText(entry.text || entry.title, "detail.failureUnknown")}</p>;
}
function ToolEntry({ entry, live }: { entry: AgentTimelineEntry; live: boolean }) {
  const [open, setOpen] = useState(false);
  const streaming = entry.type === "command" && live && entry.status === "running";
  const hasDetails = !!(entry.output?.text || entry.input?.text || entry.text || entry.cwd || entry.path || entry.changes?.length || entry.truncated || entry.input?.truncated || entry.output?.truncated);
  return <div className="task-tool-row min-w-0 font-mono text-xs leading-relaxed wrap-anywhere data-[failed]:text-destructive" data-failed={entry.status === "failed" || undefined}>
    <Fold className="task-tool-entry [&>.timeline-summary]:gap-1.5 [&>.timeline-summary]:px-0 [&>.timeline-summary]:py-1 [&>.timeline-summary>span:last-of-type]:shrink-0" open={open} onChange={setOpen} expandable={hasDetails}
      summary={<><Icon icon={stepIcons[entry.type]} /><ToolTitle entry={entry} /><span>{entry.exitCode !== undefined && t("timeline.exitCode", { code: entry.exitCode })}</span></>}>
      {!!entry.changes?.length && <ChangedFiles entries={[entry]} />}
      <ToolDetails entry={entry} />
    </Fold>
    {streaming && !open && <pre className="task-live-log overflow-x-auto rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap text-foreground wrap-anywhere">{(entry.output?.text || entry.text || "").split("\n").slice(-8).join("\n")}</pre>}
  </div>;
}
function ToolRun({ entries, live }: { entries: AgentTimelineEntry[]; live: boolean }) {
  const active = live && entries.some(entry => entry.status === "running");
  const [manual, setManual] = useState<boolean>();
  const counts = toolCounts(entries, live);
  const stats = (Object.keys(counts) as (keyof typeof counts)[]).filter(kind => counts[kind] && (kind !== "running" || live)).map(kind => <span key={kind} className="task-tool-count rounded-full bg-muted px-2 py-0.5 text-xs">{t(`detail.tools.${kind}`, { count: counts[kind] })}</span>);
  return <Fold className="task-tool-run text-xs text-muted-foreground" open={manual ?? active} onChange={setManual} summary={<span className="task-tool-counts flex flex-wrap gap-1">{stats}</span>}>
    <div className="task-tool-rows ml-1.5 grid gap-1.5 border-l-2 pl-2.5">{entries.map(entry => <ToolEntry key={entry.id} entry={entry} live={live} />)}</div>
  </Fold>;
}
export default function TimelineEntries({ entries, agent, session, now, running = false, turnStatuses, turnTimings, status, onResume, onRetry, continuing }: {
  entries: AgentTimelineEntry[]; agent: string; session: AgentActivitySession; now: number; running?: boolean; turnDispatchSummaries?: Record<string, DispatchSummary>; turnStatuses?: Record<string, string>; status?: string; turnTimings?: Record<string, TurnTiming>;
  onResume?: () => void; onRetry?: () => void; continuing?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const change = (id: string) => (open: boolean) => setExpanded(previous => ({ ...previous, [id]: open }));
  const groups = timelineGroups(entries);
  return <TimelineResources agent={agent} id={session.id}>{groups.map((group, index) => {
    const latest = index === groups.length - 1;
    const current = !session.turnId || !group.turnId || group.turnId === session.turnId;
    const live = latest && current && running;
    const pending = group.entries.some(entry => entry.type === "interaction" && entry.status === "pending");
    const state = taskState((group.turnId ? turnStatuses?.[group.turnId] : undefined) ?? (latest && current ? status : undefined), live, pending);
    const projection = projectTurn(group.entries, state);
    const { prompt, final, rows } = projection;
    const duration = turnDuration(group.entries, now, live, latest && current ? session.turnStartedAt : undefined, group.turnId ? turnTimings?.[group.turnId] : undefined);
    const source = prompt?.controlSource;
    const workId = `process:${group.id}:${state}`, turnOpen = latest || pending || (expanded[group.id] ?? false);
    const renderRow = (row: ProcessRow) => row.kind === "tools" ? <ToolRun key={row.id} entries={row.entries} live={live} /> : <ProcessEntry key={row.id} entry={row.entry} agent={agent} session={session} />;
    const process = <div className="task-process-rows flex min-w-0 flex-col gap-3 py-2">{rows.map(renderRow)}</div>;
    return <section className="task-turn flex min-w-0 flex-col gap-3" key={group.id} data-timeline-id={group.id}>
      {!latest && <Button variant="ghost" className="task-previous-turn grid h-auto min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] justify-start rounded-xl border text-start [&>span]:grid [&>span]:min-w-0 [&>span]:gap-1 [&>span]:text-xs [&>span]:text-muted-foreground [&>span>span]:truncate [&>span>span]:text-sm [&>span>span]:text-foreground [&[aria-expanded=true]>.timeline-chevron]:rotate-90" aria-expanded={turnOpen} onClick={() => change(group.id)(!turnOpen)}>
        <span>{t("detail.previousTurn", { count: index + 1, actions: projection.actions })}{duration !== undefined && ` · ${durationText(duration)}`}<span>{final?.text?.trim().split("\n")[0] || t("detail.noFinalReply")}</span></span><Icon icon={ChevronRight} className="timeline-chevron shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none [[data-reduced-motion=true]_&]:transition-none" />
      </Button>}
      {projection.answeredInteractions.map(entry => <LiveInteractionRequestRow key={entry.id} entry={entry} agent={agent} session={session} />)}
      {turnOpen && <div className="task-turn-content flex min-w-0 flex-col gap-3">
        {prompt && <div className="task-prompt m-0 flex min-w-0 flex-col items-end gap-1 [&>small]:text-xs [&>small]:text-muted-foreground">{source && <small>{t("detail.via", { source: dispatchSourceLabel(source) })}{prompt.startedAt && ` · ${new Date(prompt.startedAt).toLocaleTimeString(locale.get(), { hour: "2-digit", minute: "2-digit" })}`}</small>}
          <UserMessage text={prompt.text ?? ""} truncated={prompt.truncated} open={expanded[prompt.id] ?? false} onChange={change(prompt.id)} /></div>}
        {!!rows.length && (live ? process : <Fold className="task-process [&>.timeline-summary]:rounded-lg [&>.timeline-summary]:border [&>.timeline-summary]:border-dashed [&>.timeline-summary]:px-3 [&>.timeline-summary]:py-2 [&>.timeline-summary]:text-xs [&>.timeline-summary]:text-muted-foreground" open={processOpen(state, expanded[workId])} onChange={change(workId)} summary={<span>{t("detail.process", projection)}{duration !== undefined && <> · <Duration value={duration} /></>}</span>}>{process}</Fold>)}
        {(state === "failed" || state === "interrupted") && <TaskOutcome state={state} entries={group.entries} project={session.project} onResume={latest && current ? onResume : undefined} onRetry={latest && current ? onRetry : undefined} continuing={continuing} />}
        <TaskReceiptHistory agent={agent} id={session.id} turnId={group.turnId} latest={latest} />
        {projection.thinking && <div className="task-thinking truncate text-sm text-muted-foreground motion-safe:animate-pulse [[data-reduced-motion=true]_&]:animate-none" role="status">{projection.thinking.text}</div>}
        {final && state !== "failed" && state !== "interrupted" && <Card asChild className="gap-0 p-3"><article className="task-final min-w-0 rounded-xl border bg-card p-3 text-sm leading-relaxed wrap-anywhere [&>header]:mb-2 [&>header]:text-xs [&>header]:text-success"><SectionHeader  level={3} title={<><Icon icon={Check} /></>} actions={<><strong>{t("detail.finalReply")}</strong><CopyReply text={final.text ?? ""} /></>} /><TimelineMarkdown text={final.text ?? ""} />{final.truncated && <span className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere">{t("timeline.truncated")}</span>}<ChangedFiles entries={group.entries} project={session.project} /></article></Card>}
      </div>}
    </section>;
  })}</TimelineResources>;
}
