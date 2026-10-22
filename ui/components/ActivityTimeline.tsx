import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { AlertCircle, ArrowUpRight, ChevronRight, ShieldAlert, X, Bot, Brain, Check, FileText, ListChecks, MessageSquare, Terminal, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../api";
import { t } from "../i18n";
import type { AgentActivitySession, AgentTimeline, AgentTimelineEntry } from "../types";
import { activityApprovals, agentActivity, openActivitySession } from "../state/activity";
import { expandableTimelineEntry, interactionTool, permissionRequestLabel, visibleTimelineEntries, followsTimeline, refreshTimeline, timelineScrollTarget } from "../state/timelineModel";
import { useInterval } from "../state/hooks";
import { Button, Dialog, Icon, IconButton, Tooltip } from "./ui";
import { Markdown } from "./ui/Markdown";
import ActivityInteraction from "./ActivityInteraction";
import FilePath from "./FilePath";
import { activityHeadline, filePathParts, interactionKey } from "../state/activityModel";

import { name, orderedAgents, icons as agentIcons } from "../state/agents";

const icons = { thinking: Brain, command: Terminal, file: FileText, tool: Wrench };
function TimelineEntry({ entry, agent, session, now }: {
  entry: AgentTimelineEntry; agent: string; session: AgentActivitySession; now: number;
}) {
  const submissions = activityApprovals.use();
  const duration = entry.durationMs ?? (entry.startedAt && (entry.endedAt || entry.status === "running")
    ? (entry.endedAt ? Date.parse(entry.endedAt) : now) - Date.parse(entry.startedAt) : NaN);
  const time = Number.isFinite(duration) ? t("activity.seconds", { count: Math.max(0, Math.floor(duration / 1000)) }) : "—";
  if (entry.type === "text" || entry.type === "user") return <article className={`timeline-text ${entry.type === "user" ? "timeline-user" : ""}`}>
    {entry.type === "user" && <span className="timeline-meta"><Icon icon={MessageSquare} />{t("timeline.user")}</span>}
    <Markdown>{entry.text ?? ""}</Markdown>
  </article>;
  if (entry.type === "error") return <p className="timeline-error" role="alert" title={entry.text}><Icon icon={AlertCircle} /><span>{entry.text}</span></p>;
  if (entry.type === "plan") return <div className="timeline-plan"><span className="timeline-meta"><Icon icon={ListChecks} />{t("timeline.plan")}</span>
    <ul>{entry.plan?.map((step, index) => <li key={index} data-completed={step.status === "completed"}>
      <span className="timeline-check" aria-label={t(`timeline.status.${step.status === "completed" ? "completed" : "pending"}`)}>{step.status === "completed" && <Icon icon={Check} />}</span>
      <span>{step.content.text}</span>
    </li>)}</ul>
  </div>;
  if (entry.type === "interaction") {
    const interactionSession = { ...session, phase: "interaction" as const, headline: entry.interaction?.summary ?? "", phaseSince: entry.startedAt, interaction: entry.interaction };
    const headline = activityHeadline(interactionSession);
    const receipt = submissions[interactionKey(agent, interactionSession)];
    const resolved = receipt?.status === "submitted";
    const denied = resolved && ["deny", "cancel"].includes(receipt.decision);
    const pending = !resolved && entry.status === "pending";
    const label = resolved ? denied ? "timeline.denied" : "timeline.allowed"
      : pending ? entry.interaction?.kind === "permission" ? "activity.phase.interaction" : "activity.question" : `timeline.status.${entry.status}`;
    return <div className="timeline-interaction" data-pending={pending || undefined} data-resolved={resolved || undefined}>
      <Icon icon={pending ? ShieldAlert : denied ? X : Check} />
      <span className="timeline-interaction-state">{t(label)} ·</span>
      <span className="timeline-entry-title" title={headline.fullText}>{headline.path ? <FilePath path={headline.path} project={session.project} /> : headline.text}</span>
    </div>;
  }
  const kind = entry.type as keyof typeof icons;
  const title = kind === "thinking" ? entry.text?.trim().split("\n").at(-1) || t("activity.phase.thinking")
    : entry.command || entry.path || entry.title || t(`activity.phase.${kind}`);
  const expandable = expandableTimelineEntry(entry);
  const summary = <>
    {expandable && <Icon icon={ChevronRight} className="timeline-chevron" />}
    <Icon icon={icons[kind]} /><span className="timeline-entry-title" title={title}>{kind === "file" && entry.path ? <FilePath path={entry.path} project={session.project || entry.cwd} /> : title}</span>
    <span className={`timeline-status ${entry.status === "failed" ? "activity-error" : ""}`}>{t(`timeline.status.${entry.status}`)}</span>
    {Number.isFinite(duration) && <time>{time}</time>}
  </>;
  if (!expandable) return <div className="timeline-detail"><div className="timeline-summary">{summary}</div></div>;
  return <details className="timeline-detail">
    <summary className="timeline-summary">{summary}</summary>
    <div className="timeline-output">
      {kind === "thinking" ? <Markdown>{entry.text ?? ""}</Markdown> : <>
        {entry.cwd && <div className="timeline-meta">{entry.cwd}</div>}
        {entry.path && <div>{filePathParts(entry.path, session.project || entry.cwd).fullPath}</div>}
        {entry.changes?.filter(change => change.path !== entry.path).map(change => <div key={change.path}>{filePathParts(change.path, session.project || entry.cwd).fullPath}</div>)}
        {entry.input?.text && <pre>{entry.input.text}</pre>}
        {entry.output?.text && <pre>{entry.output.text}</pre>}
        {entry.exitCode !== undefined && <div className="timeline-meta">{t("timeline.exitCode", { code: entry.exitCode })}</div>}
      </>}
      {(entry.truncated || entry.input?.truncated || entry.output?.truncated) && <span className="timeline-meta">{t("timeline.truncated")}</span>}
    </div>
  </details>;
}
export default function ActivityTimeline({ agent, session, onClose, onPanelFrame }: {
  agent: string; session: AgentActivitySession; onClose: () => void; onPanelFrame: (rect: import("../motion/surface").SurfaceRect | null) => void;
}) {
  const { snapshot } = agentActivity.use();
  const submissions = activityApprovals.use(), cardId = useId(), reduced = useReducedMotion();
  const [atLatest, setAtLatest] = useState(true);
  const [timeline, setTimeline] = useState<AgentTimeline>();
  const [error, setError] = useState(""), [openError, setOpenError] = useState("");
  const [now, setNow] = useState(Date.now);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const following = useRef(true), initial = useRef(true), previousRunning = useRef(true), previousTop = useRef(0);
  const live = snapshot?.agents[agent]?.sessions.find(s => s.id === session.id);
  const external = session.source === "transcript";
  // Completed history entries do not override a session in the live snapshot.
  const running = !!live || !external && ["running", "inProgress", "starting", "waiting-permission", "cancelling"].includes(timeline?.status ?? "");
  const followAllowed = useRef(true);
  followAllowed.current = running;
  useInterval(() => setNow(Date.now()), running ? 1000 : null);
  useEffect(() => {
    if (!session.timeline) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>, current: AgentTimeline | undefined;
    async function read() {
      try {
        const read = (after?: number) => api<AgentTimeline>(`agents/timeline/${encodeURIComponent(session.id)}${after === undefined ? "" : `?after=${after}`}`);
        const next = external ? await read() : await refreshTimeline(current, read);
        if (stopped) return;
        current = next; setTimeline(next); setError("");
      } catch (error) { if (!stopped) setError(String(error)); }
      if (!stopped) timer = setTimeout(read, external ? 5000 : 1000);
    }
    void read();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session.id, session.timeline, external]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || !timeline) return;
    const target = timelineScrollTarget(following.current, running || previousRunning.current, initial.current, node.scrollHeight);
    if (target !== undefined) { node.scrollTop = target; previousTop.current = node.scrollTop; }
    initial.current = false; previousRunning.current = running;
  }, [timeline, running]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const node = viewport.current;
      if (node && following.current && followAllowed.current) { node.scrollTop = node.scrollHeight; previousTop.current = node.scrollTop; }
    });
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const nativeSession = live ?? { ...session, interaction: undefined };
  const pendingSession = !external && !timeline?.readOnly && live?.interaction ? live : undefined;
  const submission = pendingSession ? submissions[interactionKey(agent, pendingSession)] : undefined;
  const showCard = !!pendingSession && submission?.status !== "submitted";
  const agentName = name(orderedAgents().find(a => a.agent === agent) ?? { agent });
  const duration = session.startedAt ? Math.max(0, Math.floor((now - Date.parse(session.startedAt)) / 1000)) : undefined;
  useEffect(() => {
    if (showCard) document.getElementById(cardId)?.focus({ preventScroll: true });
  }, [showCard, pendingSession?.phaseSince, cardId]);
  const pendingEntry = timeline?.entries.find(entry => entry.type === "interaction" && pendingSession
    && interactionKey(agent, { ...pendingSession, phaseSince: entry.startedAt, interaction: entry.interaction }) === interactionKey(agent, pendingSession));
  const tool = pendingEntry && timeline ? interactionTool(timeline.entries, pendingEntry) : undefined;
  const requestLabel = pendingSession?.interaction?.kind === "question" ? "timeline.questionRequest"
    : pendingSession?.interaction?.command ? "timeline.commandRequest" : permissionRequestLabel(tool);
  const subtitle = [agentName, session.project?.replace(/[\\/]+$/, "").split(/[\\/]/).pop(),
    duration === undefined ? undefined : t("activity.seconds", { count: duration })].filter(Boolean).join(" · ");
  const footer = showCard && <section className="activity-approval-card" id={cardId} tabIndex={-1} aria-label={t("activity.needsAttention")}>
    <strong>{t(requestLabel, { agent: agentName })}</strong>
    <p className="mono">{pendingSession.interaction?.path
      ? <FilePath path={pendingSession.interaction.path} project={pendingSession.project} />
      : pendingSession.interaction?.command || pendingSession.interaction?.summary}</p>
    <ActivityInteraction key={interactionKey(agent, pendingSession)} agent={agent} session={pendingSession} questions />
  </section>;
  return <Dialog title={<span className="activity-panel-title" title={session.title || t("timeline.title")}>{session.title || t("timeline.title")}</span>}
    leading={<span className="activity-panel-agent" aria-hidden="true">{agentIcons[agent] ? <span dangerouslySetInnerHTML={{ __html: agentIcons[agent] }} /> : <Icon icon={Bot} />}</span>}
    headerDetail={<div className="activity-panel-subline">
      <span className="activity-status" data-state={showCard ? "attention" : running ? "running" : "completed"}>
        {t(showCard ? pendingSession.interaction?.kind === "question" ? "activity.question" : "activity.phase.interaction" : running ? "timeline.status.running" : "activity.completed")}
      </span><span className="activity-panel-meta" title={subtitle}>{subtitle}</span>
    </div>}
    width={400} dockRight onClose={onClose} onPanelFrame={onPanelFrame} returnFocus={`[data-activity-session="${CSS.escape(JSON.stringify([agent, session.id]))}"]`} initialFocus={showCard ? cardId : undefined} footer={footer}
    actions={nativeSession.open && <Tooltip text={t("activity.open")}><IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
      setOpenError(""); void openActivitySession(agent, nativeSession).catch(error => setOpenError(String(error)));
    }} /></Tooltip>}>
    <div className="task-timeline">
      {((!external && error) || openError) && <p className="timeline-error" role="alert">{openError || error}</p>}
      <div className="timeline-scroll" ref={viewport} tabIndex={0} aria-label={t("timeline.title")}
        onWheel={event => { if (event.deltaY < 0) following.current = false; }}
        onScroll={event => {
          const node = event.currentTarget;
          following.current = followsTimeline(node.scrollTop, node.clientHeight, node.scrollHeight, previousTop.current);
          previousTop.current = node.scrollTop;
          setAtLatest(node.scrollHeight - node.scrollTop - node.clientHeight <= 24);
        }}>
        <div ref={content} className="timeline-entries">
          {external && <p className="timeline-meta">{t("timeline.external")}</p>}
          {!timeline && session.timeline && !error && <p role="status">{t("timeline.loading")}</p>}
          {(!session.timeline || !timeline?.entries.length && (external || !!error)) && <section className="activity-session-summary">
            <span className="timeline-meta">{t(`activity.phase.${nativeSession.phase}`)}</span>
            {(nativeSession.recentContent?.length ? nativeSession.recentContent : [activityHeadline(nativeSession, t("timeline.title")).text])
              .map((text, index) => <p key={index}>{text}</p>)}
          </section>}
          {!external && timeline?.entries.length === 0 && <p className="timeline-meta">{t("timeline.empty")}</p>}
          {visibleTimelineEntries(timeline?.entries ?? []).map(entry => <motion.div key={entry.id} className="timeline-item" data-status={entry.status}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.24 }}>
            <TimelineEntry entry={entry} agent={agent} session={nativeSession} now={now} />
          </motion.div>)}
        </div>
      </div>
      {!atLatest && <Button variant="ghost" className="timeline-latest" onClick={() => {
        const node = viewport.current;
        if (node) { node.scrollTop = node.scrollHeight; following.current = true; setAtLatest(true); }
      }}>{t("timeline.latest")}</Button>}
    </div>
  </Dialog>;
}
