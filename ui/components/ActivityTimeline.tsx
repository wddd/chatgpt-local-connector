import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { ArrowUpRight, ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import type { AgentTimeline } from "../types";
import { activityApprovals, agentActivity, openActivitySession } from "../state/activity";
import { interactionTool, permissionRequestLabel, followsTimeline, refreshTimeline, timelineScrollTarget } from "../state/timelineModel";
import { useInterval } from "../state/hooks";
import { Button, IconButton, Tooltip } from "./ui";
import TimelineEntries, { durationText } from "./TimelineEntries";
import { dispatchSourceLabel, SourceBadge, SpecPill } from "./activity";
import { connector } from "../state/connector";
import { timelineGroups } from "../state/timelineGroups";
import ActivityInteraction from "./ActivityInteraction";
import FilePath from "./FilePath";
import { activityHeadline, interactionKey, type TrackedActivity } from "../state/activityModel";
import type { TaskRuntime } from "../state/tasks";

import { name, orderedAgents } from "../state/agents";

export default function ActivityTimeline({ agent, session, expanded, onToggleWidth, onBack }: {
  agent: string; session: TrackedActivity; expanded: boolean; onToggleWidth: () => void; onBack: () => void;
}) {
  const { snapshot } = agentActivity.use();
  const connection = connector.use();
  const submissions = activityApprovals.use(), cardId = useId();
  const [atLatest, setAtLatest] = useState(true);
  const [timeline, setTimeline] = useState<AgentTimeline>();
  const [taskTitle, setTaskTitle] = useState("");
  const [error, setError] = useState(""), [openError, setOpenError] = useState("");
  const [now, setNow] = useState(Date.now);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const following = useRef(true), initial = useRef(true), previousRunning = useRef(true), previousTop = useRef(0);
  const manualDisclosure = useRef(false);
  const live = snapshot?.agents[agent]?.sessions.find(s => s.id === session.id);
  const external = session.source === "transcript";
  // Completed history entries do not override a session in the live snapshot.
  const running = !!live || session.endedAt === undefined && !external && !timeline?.readOnly && ["running", "inProgress", "starting", "waiting-permission", "cancelling"].includes(timeline?.status ?? "");
  const statusUnknown = session.conversation && !running && !["completed", "idle", "cancelled", "failed"].includes(timeline?.status ?? "");
  const completedAt = useRef(session.endedAt);
  if (running) completedAt.current = undefined;
  else completedAt.current ??= session.endedAt ?? now;
  const followAllowed = useRef(true);
  followAllowed.current = running;
  useInterval(() => setNow(Date.now()), running ? 1000 : null);
  useEffect(() => {
    setTaskTitle("");
    if (agent !== "codex") return;
    let stopped = false;
    void api<TaskRuntime>(`tasks/runtime/${encodeURIComponent(session.id)}`).then(task => {
      if (!stopped) setTaskTitle(task.title?.trim() ?? "");
    }).catch(() => { /* Retain the snapshot title when native metadata is unavailable. */ });
    return () => { stopped = true; };
  }, [agent, session.id]);
  useEffect(() => {
    if (!session.timeline) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>, current: AgentTimeline | undefined;
    async function read() {
      try {
        const read = (after?: number) => session.conversation
          ? api<AgentTimeline>("agents/conversations/timeline", "POST", { agent, id: session.id, ...(after === undefined ? {} : { after }) })
          : api<AgentTimeline>(`agents/timeline/${encodeURIComponent(session.id)}${after === undefined ? "" : `?after=${after}`}`);
        const next = external || current?.readOnly ? await read() : await refreshTimeline(current, read);
        if (stopped) return;
        if (manualDisclosure.current && (next.cursor !== current?.cursor || next.status !== current?.status
          || JSON.stringify(next.entries) !== JSON.stringify(current?.entries))) {
          // Resume only for new timeline content, using the position before it renders.
          const node = viewport.current;
          if (node) {
            following.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
            setAtLatest(following.current);
          }
          manualDisclosure.current = false;
        }
        current = next; setTimeline(next); setError("");
      } catch (error) { if (!stopped) setError(String(error)); }
      if (!stopped) timer = setTimeout(read, external || current?.readOnly ? 5000 : 1000);
    }
    void read();
    return () => { stopped = true; clearTimeout(timer); };
  }, [agent, session.id, session.timeline, session.conversation, external]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || !timeline || manualDisclosure.current) return;
    const target = timelineScrollTarget(following.current, running || previousRunning.current, initial.current, node.scrollHeight);
    if (target !== undefined) { node.scrollTop = target; previousTop.current = node.scrollTop; }
    initial.current = false; previousRunning.current = running;
  }, [timeline, running]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const node = viewport.current;
      // Disclosure resizing is local navigation, including its animation frames.
      if (node && !manualDisclosure.current && following.current && followAllowed.current) { node.scrollTop = node.scrollHeight; previousTop.current = node.scrollTop; }
    });
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const nativeSession = live ?? { ...session, interaction: undefined };
  const pendingSession = !external && !timeline?.readOnly && live?.interaction ? live : undefined;
  const submission = pendingSession ? submissions[interactionKey(agent, pendingSession)] : undefined;
  const showCard = !!pendingSession && submission?.status !== "submitted";
  const agentName = name(orderedAgents().find(a => a.agent === agent) ?? { agent });
  const startedAt = nativeSession.turnStartedAt ?? (session.conversation ? undefined : nativeSession.startedAt);
  const duration = startedAt ? Math.max(0, Math.floor(((completedAt.current ?? now) - Date.parse(startedAt)) / 1000)) : undefined;
  useEffect(() => {
    if (showCard) document.getElementById(cardId)?.focus({ preventScroll: true });
  }, [showCard, pendingSession?.phaseSince, cardId]);
  const pendingEntry = timeline?.entries.find(entry => entry.type === "interaction" && pendingSession
    && interactionKey(agent, { ...pendingSession, phaseSince: entry.startedAt, interaction: entry.interaction }) === interactionKey(agent, pendingSession));
  const tool = pendingEntry && timeline ? interactionTool(timeline.entries, pendingEntry) : undefined;
  const requestLabel = pendingSession?.interaction?.kind === "question" ? "timeline.questionRequest"
    : pendingSession?.interaction?.command ? "timeline.commandRequest" : permissionRequestLabel(tool);
  const subtitle = [agentName, session.project?.replace(/[\\/]+$/, "").split(/[\\/]/).pop(),
    duration === undefined ? undefined : durationText(duration * 1000)].filter(Boolean).join(" · ");
  const latestSummary = live ? live.dispatchSummary : timeline?.dispatchSummary ?? nativeSession.dispatchSummary;
  const source = latestSummary?.controlSource;
  const knownSource = source?.id ? connection.sources.find(item => item.id === source.id) : undefined;
  const where = knownSource ? connection.status?.ingresses.find(item => item.id === knownSource.ingressId)?.name || knownSource.connectionName : undefined;
  const turnCount = timelineGroups(timeline?.entries ?? [], external).length;
  const title = taskTitle || nativeSession.title || session.title || t("timeline.title");
  const footer = showCard && <section className="activity-approval-card" id={cardId} tabIndex={-1} aria-label={t("activity.needsAttention")}>
    <strong>{t(requestLabel, { agent: agentName })}</strong>
    <p className="mono">{pendingSession.interaction?.path
      ? <FilePath path={pendingSession.interaction.path} project={pendingSession.project} />
      : pendingSession.interaction?.command || pendingSession.interaction?.summary}</p>
    <ActivityInteraction key={interactionKey(agent, pendingSession)} agent={agent} session={pendingSession} questions />
  </section>;
  return <section className="agent-panel-layer task-detail-layer">
    <header className="dialog-header">
      <IconButton icon={ArrowLeft} label={t("back")} onClick={onBack} />
      <div className="task-detail-heading"><h2 className="activity-panel-title" title={title}>{title}</h2>
        <span className="activity-status" data-state={showCard ? "attention" : running ? "running" : statusUnknown ? "unknown" : "completed"}>
          {t(showCard ? pendingSession.interaction?.kind === "question" ? "activity.question" : "activity.phase.interaction" : running ? "timeline.status.running" : statusUnknown ? "unknown" : "activity.completed")}
        </span></div>
      <div className="actions">
        {nativeSession.open && <Tooltip text={t("activity.open")}><IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
          setOpenError(""); void openActivitySession(agent, nativeSession).catch(error => setOpenError(String(error)));
        }} /></Tooltip>}
        <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")}
          aria-pressed={expanded} onClick={onToggleWidth} />
      </div>
      <div className="activity-panel-subline">
        <span className="activity-panel-meta" title={subtitle}>{subtitle}</span>
      </div>
      <div className="activity-panel-subline task-detail-dispatch">
        {source && <span className="task-source-chip"><SourceBadge source={source} /><span>{dispatchSourceLabel(source)}</span>{where && <span className="task-source-where">{where}</span>}</span>}
        <SpecPill summary={latestSummary} />{turnCount > 0 && <span className="timeline-meta">{t("timeline.turnCount", { count: turnCount })}</span>}
      </div>
    </header>
    <div className="task-timeline">
      {((!external && error) || openError) && <p className="timeline-error" role="alert">{openError || error}</p>}
      <div className="timeline-scroll" ref={viewport} tabIndex={0} aria-label={t("timeline.title")}
        onWheel={event => {
          const node = event.currentTarget;
          if (manualDisclosure.current) following.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
          manualDisclosure.current = false;
          if (event.deltaY < 0) following.current = false;
        }}
        onScroll={event => {
          const node = event.currentTarget;
          following.current = followsTimeline(node.scrollTop, node.clientHeight, node.scrollHeight, previousTop.current);
          if (!following.current) manualDisclosure.current = false;
          previousTop.current = node.scrollTop;
          setAtLatest(node.scrollHeight - node.scrollTop - node.clientHeight <= 24);
        }}>
        <div ref={content} className="timeline-entries" onClickCapture={event => {
          if ((event.target as Element).closest("button")) manualDisclosure.current = true;
        }}>
          {timeline?.coverage.state === "partial" && <p className="timeline-meta">{t("timeline.truncated")}</p>}
          {external && <p className="timeline-meta">{t("timeline.external")}</p>}
          {!timeline && session.timeline && !error && <p role="status">{t("timeline.loading")}</p>}
          {(!session.timeline || !timeline?.entries.length && (external || !!error)) && <section className="activity-session-summary">
            <span className="timeline-meta">{t(`activity.phase.${nativeSession.phase}`)}</span>
            {(nativeSession.recentContent?.length ? nativeSession.recentContent : [activityHeadline(nativeSession, t("timeline.title")).text])
              .map((text, index) => <p key={index}>{text}</p>)}
          </section>}
          {!external && timeline?.entries.length === 0 && <p className="timeline-meta">{t("timeline.empty")}</p>}
          <TimelineEntries key={session.id} entries={timeline?.entries ?? []} agent={agent} session={nativeSession} now={now} running={running} partial={timeline?.coverage.state === "partial"} status={timeline?.status} turnStatuses={timeline?.turnStatuses} turnDispatchSummaries={timeline?.turnDispatchSummaries} />
        </div>
      </div>
      {!atLatest && <Button variant="ghost" className="timeline-latest" onClick={() => {
        const node = viewport.current;
        if (node) { manualDisclosure.current = false; node.scrollTop = node.scrollHeight; following.current = true; setAtLatest(true); }
      }}>{t("timeline.latest")}</Button>}
    </div>
    {footer && <footer className="dialog-footer">{footer}</footer>}
  </section>;
}
