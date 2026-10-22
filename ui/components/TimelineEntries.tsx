import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, Circle, FileText, ListChecks, LoaderCircle, Minus, ShieldAlert, Terminal, Wrench, X } from "lucide-react";
import { Collapsible } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "../i18n";
import { openUrl } from "../platform";
import type { AgentActivitySession, AgentTimelineEntry } from "../types";
import { activityApprovals } from "../state/activity";
import { activityHeadline, filePathParts, interactionKey } from "../state/activityModel";
import { expandableTimelineEntry, visibleTimelineEntries } from "../state/timelineModel";
import { currentTimelineTool, entryDuration, isTimelineTool, timelineGroups, toolGroupOpen, toolGroupState, type TimelineGroup } from "../state/timelineGroups";
import { Icon } from "./ui";
import { PhaseLabel, PhaseTile } from "./activity";
import FilePath from "./FilePath";

const toolIcons = { command: Terminal, file: FileText, tool: Wrench };
const statusIcons = { running: LoaderCircle, completed: Check, failed: X, cancelled: Minus, pending: Circle, unknown: Circle };
function Duration({ value }: { value?: number }) {
  return value === undefined ? null : <time>{t("activity.seconds", { count: Math.floor(value / 1000) })}</time>;
}
function Fold({ open, onChange, summary, children, className = "" }: {
  open: boolean; onChange: (open: boolean) => void; summary: ReactNode; children: ReactNode; className?: string;
}) {
  const reduced = useReducedMotion();
  return <Collapsible.Root open={open} onOpenChange={onChange} className={`timeline-fold ${className}`}>
    <Collapsible.Trigger className="timeline-summary" type="button">
      {summary}<Icon icon={ChevronRight} className="timeline-chevron" />
    </Collapsible.Trigger>
    <AnimatePresence initial={false}>
      {open && <Collapsible.Content forceMount asChild>
        <motion.div className="timeline-fold-content" initial={{ height: reduced ? "auto" : 0, opacity: reduced ? 1 : 0 }}
          animate={{ height: "auto", opacity: 1 }} exit={{ height: reduced ? "auto" : 0, opacity: reduced ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
          {children}
        </motion.div>
      </Collapsible.Content>}
    </AnimatePresence>
  </Collapsible.Root>;
}
const TimelineMarkdown = memo(function TimelineMarkdown({ text }: { text: string }) {
  return <div className="markdown timeline-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a: ({ href, children }) => <a href={href} onClick={event => { event.preventDefault(); if (href) void openUrl(href); }}>{children}</a>,
    table: ({ children }) => <div className="timeline-table"><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>;
});
function ToolTitle({ entry, project }: { entry: AgentTimelineEntry; project?: string | null }) {
  return <span className="timeline-entry-title mono" title={entry.command || entry.path || entry.title}>
    {entry.path && !entry.command ? <FilePath path={entry.path} project={project || entry.cwd} /> : entry.command || entry.title || t(`activity.phase.${entry.type}`)}
  </span>;
}
function ToolDetails({ entry, project }: { entry: AgentTimelineEntry; project?: string | null }) {
  return <div className="timeline-output">
    {entry.cwd && <section><span className="timeline-meta">{t("timeline.cwd")}</span><div className="mono">{entry.cwd}</div></section>}
    {entry.path && <section><span className="timeline-meta">{t("timeline.path")}</span><div className="mono">{filePathParts(entry.path, project || entry.cwd).fullPath}</div></section>}
    {!!entry.changes?.length && <section><span className="timeline-meta">{t("timeline.changes")}</span><ul className="timeline-files">{entry.changes.map((change, index) => <li key={`${change.path}:${index}`}>
      <FilePath path={change.path} project={project || entry.cwd} />
    </li>)}</ul></section>}
    {entry.input?.text && <section><span className="timeline-meta">{t("timeline.input")}</span><pre>{entry.input.text}</pre></section>}
    {(entry.output?.text || entry.text) && <section><span className="timeline-meta">{t("timeline.output")}</span><pre>{entry.output?.text || entry.text}</pre></section>}
    {entry.exitCode !== undefined && <div className="timeline-meta">{t("timeline.exitCode", { code: entry.exitCode })}</div>}
    {(entry.truncated || entry.input?.truncated || entry.output?.truncated) && <span className="timeline-meta">{t("timeline.truncated")}</span>}
  </div>;
}
function TimelineEntry({ entry, agent, session, now, open, onChange }: {
  entry: AgentTimelineEntry; agent: string; session: AgentActivitySession; now: number; open: boolean; onChange: (open: boolean) => void;
}) {
  const submissions = activityApprovals.use();
  const duration = entryDuration(entry, now);
  if (entry.type === "text" || entry.type === "user") return <article className={`timeline-text ${entry.type === "user" ? "timeline-user" : ""}`} aria-label={entry.type === "user" ? t("timeline.user") : undefined}>
    <TimelineMarkdown text={entry.text ?? ""} />
  </article>;
  if (entry.type === "thinking") return <Fold open={open} onChange={onChange} className="timeline-thinking" summary={<>
    <PhaseTile phase="thinking" animated={false} />
    <PhaseLabel phase="thinking" running={entry.status === "running"}>{duration === undefined ? t("activity.phase.thinking") : t("timeline.thought", { count: Math.floor(duration / 1000) })}</PhaseLabel>
  </>}><div className="timeline-thought-text"><TimelineMarkdown text={entry.text ?? ""} />{entry.truncated && <span className="timeline-meta">{t("timeline.truncated")}</span>}</div></Fold>;
  if (entry.type === "error") return <Fold open={open} onChange={onChange} className="timeline-error" summary={<>
    <Icon icon={AlertCircle} /><span className="timeline-entry-title">{entry.text || entry.title || t("timeline.status.failed")}</span>
  </>}><pre className="timeline-error-text">{entry.text || entry.title}</pre></Fold>;
  if (entry.type === "plan") return <div className="timeline-plan"><span className="timeline-meta"><Icon icon={ListChecks} />{t("timeline.plan")}</span>
    <ul>{entry.plan?.map((step, index) => <li key={index} data-completed={step.status === "completed" || undefined} data-current={["in_progress", "inProgress", "running"].includes(step.status) || undefined}>
      <span className="timeline-check" aria-label={t(`timeline.status.${step.status === "completed" ? "completed" : ["in_progress", "inProgress", "running"].includes(step.status) ? "running" : "pending"}`)}>{step.status === "completed" && <Icon icon={Check} />}</span>
      <span>{step.content.text}</span>
    </li>)}</ul>
  </div>;
  if (entry.type === "interaction") {
    const interactionSession = { ...session, phase: "interaction" as const, headline: entry.interaction?.summary ?? "", phaseSince: entry.startedAt, interaction: entry.interaction };
    const headline = activityHeadline(interactionSession), receipt = submissions[interactionKey(agent, interactionSession)];
    const submitted = receipt?.status === "submitted", resolved = submitted || entry.status === "completed";
    const denied = submitted && ["deny", "cancel"].includes(receipt.decision);
    const pending = !resolved && entry.status === "pending";
    const label = submitted ? denied ? "timeline.denied" : entry.interaction?.kind === "question" ? "timeline.answered" : "timeline.allowed"
      : resolved ? "timeline.resolved" : pending ? "timeline.waitingApproval" : `timeline.status.${entry.status}`;
    return <div className="timeline-interaction" data-pending={pending || undefined} data-resolved={resolved || undefined} data-denied={denied || undefined}>
      <Icon icon={pending ? ShieldAlert : denied ? X : resolved ? Check : Circle} />
      <span className="timeline-interaction-state">{t(label)} ·</span>
      <span className="timeline-entry-title" title={headline.fullText}>{headline.path ? <FilePath path={headline.path} project={session.project} /> : headline.text}</span>
    </div>;
  }
  const summary = <><span className="timeline-tool-status" role="img" aria-label={t(`timeline.status.${entry.status}`)}><Icon icon={statusIcons[entry.status]} className={entry.status === "running" ? "timeline-spinner" : ""} /></span>
    <ToolTitle entry={entry} project={session.project} />
    {entry.status === "failed" && <span className="timeline-failure">{t("timeline.status.failed")}</span>}
    <Duration value={duration} /></>;
  return <div className="timeline-tool" data-status={entry.status}>
    {expandableTimelineEntry(entry) || !!entry.changes?.length ? <Fold open={open} onChange={onChange} summary={summary}><ToolDetails entry={entry} project={session.project} /></Fold>
      : <div className="timeline-summary">{summary}</div>}
  </div>;
}
export default function TimelineEntries({ entries, agent, session, now }: {
  entries: AgentTimelineEntry[]; agent: string; session: AgentActivitySession; now: number;
}) {
  // Lives above the groups: a single tool becoming a group must retain its disclosure state.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const change = (id: string) => (open: boolean) => setExpanded(previous => ({ ...previous, [id]: open }));
  const previousGroups = useRef<TimelineGroup[]>([]);
  const groups = useMemo(() => {
    const next = timelineGroups(visibleTimelineEntries(entries), previousGroups.current);
    previousGroups.current = next;
    return next;
  }, [entries]);
  const current = currentTimelineTool(groups.flatMap(group => group.entries));
  const renderEntry = (entry: AgentTimelineEntry) => <TimelineEntry key={entry.id} entry={entry} agent={agent} session={session} now={now} open={expanded[`entry:${entry.id}`] ?? false} onChange={change(`entry:${entry.id}`)} />;
  return <>{groups.map(group => {
    const state = toolGroupState(group.entries, now), grouped = group.tools && group.entries.length > 1;
    const summary = Object.entries(state.counts).filter(([, count]) => count).map(([kind, count]) => t(`timeline.group.${kind}${count === 1 ? "One" : "Many"}`, { count })).join(t("timeline.group.separator"));
    return <div key={group.id} className="timeline-item" data-timeline-id={group.id}>
      {grouped ? <Fold className="timeline-tool-group" open={toolGroupOpen(state.running, expanded[group.id])} onChange={change(group.id)} summary={<>
        <span className="timeline-tool-icons">{state.kinds.map(kind => <span key={kind} data-phase={kind}><Icon icon={toolIcons[kind]} /></span>)}</span>
        <PhaseLabel phase="tool" running={state.running}>{summary}</PhaseLabel>
        {state.failed > 0 && <span className="timeline-failure">{t("timeline.failures", { count: state.failed })}</span>}<Duration value={state.duration} />
      </>}><div className="timeline-group-entries">{group.entries.map(renderEntry)}</div></Fold> : renderEntry(group.entries[0]!)}
      {current && group.entries.some(entry => entry.id === current.id) && <div className="timeline-current" data-phase="command">
        <div className="timeline-current-header"><Icon icon={LoaderCircle} className="timeline-spinner" /><span>{t("timeline.current")}</span><PhaseLabel phase={isTimelineTool(current) ? current.type : "tool"} running>{t(`activity.phase.${current.type}`)}</PhaseLabel><Duration value={entryDuration(current, now)} /></div>
        <ToolTitle entry={current} project={session.project} />
      </div>}
    </div>;
  })}</>;
}
