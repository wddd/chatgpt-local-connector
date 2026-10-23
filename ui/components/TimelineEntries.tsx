import { memo, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Brain, Check, ChevronRight, Circle, FileText, ListChecks, LoaderCircle, MessageSquare, Minus, ShieldAlert, Terminal, UserRound, Wrench, X } from "lucide-react";
import { Collapsible } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "../i18n";
import { openUrl } from "../platform";
import { useMedia } from "../state/hooks";
import type { AgentActivitySession, AgentTimelineEntry, DispatchSummary, TurnTiming } from "../types";
import { activityApprovals } from "../state/activity";
import { activityHeadline, filePathParts, interactionKey } from "../state/activityModel";
import { expandableTimelineEntry } from "../state/timelineModel";
import { entryDuration, timelineGroups, turnDuration, turnEntries, workBlockOpen, workState } from "../state/timelineGroups";
import { Button, Icon } from "./ui";
import { AnimatedSize } from "./ui/AnimatedSize";
import { dispatchSourceLabel, PhaseLabel, SourceBadge, SpecPill } from "./activity";
import FilePath from "./FilePath";

const stepIcons = { command: Terminal, file: FileText, tool: Wrench, thinking: Brain, text: MessageSquare, user: UserRound, plan: ListChecks, interaction: ShieldAlert, error: AlertCircle };
const statusIcons = { running: LoaderCircle, completed: Check, failed: X, cancelled: Minus, pending: Circle, unknown: Circle };
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
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  if (!expandable) return <div className={`timeline-fold ${className}`}><div className="timeline-summary">{summary}</div></div>;
  return <Collapsible.Root open={open} onOpenChange={onChange} className={`timeline-fold ${className}`}>
    <Collapsible.Trigger className="timeline-summary" type="button">
      {summary}<Icon icon={ChevronRight} className="timeline-chevron" />
    </Collapsible.Trigger>
    {reduced ? open && <Collapsible.Content className="timeline-fold-content">{children}</Collapsible.Content> : <AnimatePresence initial={false}>
      {open && <Collapsible.Content forceMount asChild>
        <motion.div className="timeline-fold-content" initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [.34, 1.56, .64, 1] }}>
          {children}
        </motion.div>
      </Collapsible.Content>}
    </AnimatePresence>}
  </Collapsible.Root>;
}
const TimelineMarkdown = memo(function TimelineMarkdown({ text }: { text: string }) {
  return <div className="markdown timeline-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a: ({ href, children }) => <a href={href} onClick={event => { event.preventDefault(); if (href) void openUrl(href); }}>{children}</a>,
    table: ({ children }) => <div className="timeline-table"><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>;
});
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
  return <article className="timeline-text timeline-user" aria-label={t("timeline.user")}>
    <div id={id} className="timeline-user-content">
      <div ref={content} className="timeline-user-preview" data-expanded={open || undefined} aria-hidden={open || undefined}>{text}</div>
      {open && <TimelineMarkdown text={text} />}
      {truncated && <span className="timeline-meta">{t("timeline.truncated")}</span>}
    </div>
    {overflow && <Button variant="ghost" className="timeline-user-toggle" aria-expanded={open} aria-controls={id} onClick={() => onChange(!open)}>
      {t(open ? "timeline.showLess" : "timeline.showMore")}
    </Button>}
  </article>;
}
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
function TimelineEntry({ entry, agent, session, now, open, onChange, live }: {
  entry: AgentTimelineEntry; agent: string; session: AgentActivitySession; now: number; open: boolean; onChange: (open: boolean) => void; live: boolean;
}) {
  const submissions = activityApprovals.use();
  const status = !live && entry.status === "running" ? "unknown" : entry.status;
  const duration = entryDuration({ ...entry, status }, now);
  const kind = <Icon icon={stepIcons[entry.type]} />;
  const title = entry.title || entry.text || t(`activity.phase.${entry.type}`);
  if (entry.type === "user" || entry.type === "text") return <Fold open={open} onChange={onChange} className="timeline-intermediate" expandable={!!entry.text?.trim()} summary={<>
    {kind}<span className="timeline-entry-title" title={entry.text}>{entry.text || t(entry.type === "user" ? "timeline.user" : "activity.phase.text")}</span><Duration value={duration} />
  </>}><div className="timeline-intermediate-detail"><TimelineMarkdown text={entry.text ?? ""} />{entry.truncated && <span className="timeline-meta">{t("timeline.truncated")}</span>}</div></Fold>;
  if (entry.type === "thinking") {
    const summary = entry.text?.trim();
    if (!summary) return null;
    return <Fold open={open} onChange={onChange} className="timeline-thinking" summary={<>
      {kind}<span className="timeline-entry-title" title={summary}>{summary}</span><Duration value={duration} />
    </>}><div className="timeline-thought-text"><TimelineMarkdown text={summary} />{entry.truncated && <span className="timeline-meta">{t("timeline.truncated")}</span>}</div></Fold>;
  }
  if (entry.type === "error") return <Fold open={open} onChange={onChange} className="timeline-error" expandable={!!(entry.text || entry.title)} summary={<>
    {kind}<span className="timeline-entry-title">{title || t("timeline.status.failed")}</span><Duration value={duration} />
  </>}><pre className="timeline-error-text">{entry.text || entry.title}</pre></Fold>;
  if (entry.type === "plan") return <Fold open={open} onChange={onChange} className="timeline-plan" expandable={!!entry.plan?.length} summary={<>
    {kind}<span className="timeline-entry-title">{t("timeline.plan")}</span><Duration value={duration} />
  </>}><ul>{entry.plan?.map((step, index) => <li key={index} data-completed={step.status === "completed" || undefined} data-current={["in_progress", "inProgress", "running"].includes(step.status) || undefined}>
    <span className="timeline-check" aria-label={t(`timeline.status.${step.status === "completed" ? "completed" : ["in_progress", "inProgress", "running"].includes(step.status) ? "running" : "pending"}`)}>{step.status === "completed" && <Icon icon={Check} />}</span>
    <span>{step.content.text}{step.content.truncated && <span className="timeline-meta">{t("timeline.truncated")}</span>}</span>
  </li>)}</ul></Fold>;
  if (entry.type === "interaction") {
    const interactionSession = { ...session, phase: "interaction" as const, headline: entry.interaction?.summary ?? "", phaseSince: entry.startedAt, interaction: entry.interaction };
    const headline = activityHeadline(interactionSession), receipt = submissions[interactionKey(agent, interactionSession)];
    const submitted = receipt?.status === "submitted", resolved = submitted || entry.status === "completed";
    const denied = submitted && ["deny", "cancel"].includes(receipt.decision);
    const pending = !resolved && entry.status === "pending";
    const label = submitted ? denied ? "timeline.denied" : entry.interaction?.kind === "question" ? "timeline.answered" : "timeline.allowed"
      : resolved ? "timeline.resolved" : pending ? "timeline.waitingApproval" : `timeline.status.${entry.status}`;
    return <Fold open={open} onChange={onChange} className="timeline-interaction" expandable={!!(entry.interaction?.summary || headline.fullText)} summary={<>
      <Icon icon={pending ? ShieldAlert : denied ? X : resolved ? Check : Circle} />
      <span className="timeline-interaction-state" data-pending={pending || undefined}>{t(label)}</span>
      <span className="timeline-entry-title" title={headline.fullText}>{headline.path ? <FilePath path={headline.path} project={session.project} /> : headline.text}</span><Duration value={duration} />
    </>}><div className="timeline-intermediate-detail"><TimelineMarkdown text={entry.interaction?.summary || headline.fullText || ""} /></div></Fold>;
  }
  const summary = <>{kind}<ToolTitle entry={entry} project={session.project} />
    <span className="timeline-tool-status" role="img" aria-label={t(`timeline.status.${status}`)}><Icon icon={statusIcons[status]} className={status === "running" ? "timeline-spinner" : ""} /></span>
    {entry.status === "failed" && <span className="timeline-failure">{t("timeline.status.failed")}</span>}<Duration value={duration} /></>;
  return <div className="timeline-tool" data-status={status}>
    {expandableTimelineEntry(entry) || !!entry.changes?.length ? <Fold open={open} onChange={onChange} summary={summary}><ToolDetails entry={entry} project={session.project} /></Fold>
      : <div className="timeline-summary">{summary}</div>}
  </div>;
}
export default function TimelineEntries({ entries, agent, session, now, running = entries.some(entry => entry.status === "running" || entry.status === "pending"), turnDispatchSummaries, turnStatuses, turnTimings, status }: {
  entries: AgentTimelineEntry[]; agent: string; session: AgentActivitySession; now: number; running?: boolean; turnDispatchSummaries?: Record<string, DispatchSummary>; turnStatuses?: Record<string, string>; status?: string; turnTimings?: Record<string, TurnTiming>;
}) {
  // Entries keep their state when work blocks grow or history is backfilled.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const change = (id: string) => (open: boolean) => setExpanded(previous => ({ ...previous, [id]: open }));
  const groups = timelineGroups(entries);
  return <>{groups.map((group, index) => {
    const latest = index === groups.length - 1;
    const matchesSession = !group.turnId || group.turnId === session.turnId;
    const currentTurn = !session.turnId || matchesSession;
    const turnStatus = (group.turnId ? turnStatuses?.[group.turnId] : undefined) ?? (latest && currentTurn ? status : undefined);
    const live = latest && currentTurn && running;
    const waiting = live && (!!session.interaction || turnStatus === "waiting-permission");
    const completed = turnStatus === undefined ? undefined : ["completed", "idle"].includes(turnStatus);
    const { prompt, final, work } = turnEntries(group.entries, live, completed);
    const state = workState(work);
    const observedStart = latest && matchesSession ? session.turnStartedAt : undefined;
    const duration = turnDuration(group.entries, now, live, observedStart, group.turnId ? turnTimings?.[group.turnId] : undefined);
    const summary = group.turnId ? turnDispatchSummaries?.[group.turnId] ?? (latest && matchesSession ? session.dispatchSummary : undefined) : session.dispatchSummary;
    const source = summary?.controlSource;
    const workId = `work:${group.id}`, turnOpen = expanded[group.id] ?? latest;
    const workOpen = workBlockOpen(live, expanded[workId]);
    const workRows = work.filter(entry => entry.type !== "thinking" || entry.text?.trim());
    const earlierId = `earlier:${group.id}`, earlier = workRows.length - 3;
    const visibleWork = live && earlier > 0 && !expanded[earlierId] ? workRows.slice(-3) : workRows;
    const stats = Object.entries(state.counts).filter(([, count]) => count).map(([kind, count]) => t(`timeline.group.${kind}${count === 1 ? "One" : "Many"}`, { count })).join(t("timeline.group.separator"));
    const label = t(waiting ? "timeline.workWaiting" : live ? "timeline.workRunning" : "timeline.workDone");
    const header = <><span className="timeline-turn-number">{t("timeline.turn", { count: index + 1 })}</span>
      {source && <span className="timeline-turn-source" title={dispatchSourceLabel(source)}><SourceBadge source={source} /><span>{dispatchSourceLabel(source)}</span></span>}
      <SpecPill summary={summary} /><Duration value={duration} /></>;
    return <Collapsible.Root key={group.id} open={turnOpen} onOpenChange={change(group.id)} asChild>
      <section className="timeline-item timeline-turn" data-timeline-id={group.id}>
        <Collapsible.Trigger type="button" className="timeline-turn-header">{header}</Collapsible.Trigger>
        <AnimatedSize>
          <Collapsible.Content className="timeline-turn-body">
            {prompt && <UserMessage text={prompt.text ?? ""} truncated={prompt.truncated} open={expanded[`entry:${prompt.id}`] ?? false} onChange={change(`entry:${prompt.id}`)} />}
            {!!workRows.length && <Fold className="timeline-work" open={workOpen} onChange={change(workId)} summary={<>
              <span className="timeline-tool-icons">{state.kinds.map(kind => <span key={kind} data-phase={kind}><Icon icon={stepIcons[kind]} /></span>)}</span>
              <span className="timeline-work-heading"><PhaseLabel phase={waiting ? "interaction" : "tool"} running={live && !waiting}>{label}</PhaseLabel>{stats && <span className="timeline-work-stats">{stats}</span>}</span>
              {state.failed > 0 && <span className="timeline-failure">{t("timeline.failures", { count: state.failed })}</span>}
            </>}><div className="timeline-group-entries">
              {live && earlier > 0 && <Button variant="ghost" className="timeline-earlier-steps" onClick={() => change(earlierId)(!expanded[earlierId])}>{t(expanded[earlierId] ? "timeline.hideEarlierSteps" : "timeline.earlierSteps", { count: earlier })}</Button>}
              {visibleWork.map(entry => <TimelineEntry key={entry.id} entry={entry} agent={agent} session={session} now={now} live={live} open={expanded[`entry:${entry.id}`] ?? false} onChange={change(`entry:${entry.id}`)} />)}
            </div></Fold>}
            {final && <article className="timeline-text timeline-final"><TimelineMarkdown text={final.text ?? ""} />{final.truncated && <span className="timeline-meta">{t("timeline.truncated")}</span>}</article>}
          </Collapsible.Content>
          {!turnOpen && (prompt || final) && <div className="timeline-turn-preview">
            {prompt && <span className="timeline-turn-prompt">{prompt.text}</span>}
            {final && <span className="timeline-turn-answer">{final.text}</span>}
          </div>}
        </AnimatedSize>
      </section>
    </Collapsible.Root>;
  })}</>;
}
