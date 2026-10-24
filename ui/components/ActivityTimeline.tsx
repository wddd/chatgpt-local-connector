import TaskControls from "./TaskControls";
import { useTaskControl } from "../state/taskControl";
import "./TaskDetail.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import type { AgentTimeline } from "../types";
import { agentActivity, openActivitySession } from "../state/activity";
import { followsTimeline, refreshTimeline, timelineScrollTarget } from "../state/timelineModel";
import { useInterval } from "../state/hooks";
import { Button, Icon, IconButton, LoadingIndicator } from "./ui";
import TimelineEntries, { durationText } from "./TimelineEntries";
import { dispatchSourceLabel, SourceBadge, SpecPill } from "./activity";
import { connector } from "../state/connector";
import { projectTurn, taskState } from "../state/taskProjection";
import { timelineDuration, timelineGroups } from "../state/timelineGroups";
import TaskNeedsYou from "./TaskNeedsYou";
import { activityHeadline, type TrackedActivity } from "../state/activityModel";
import type { TaskRuntime } from "../state/tasks";

import { name, orderedAgents } from "../state/agents";

export default function ActivityTimeline({ agent, session, expanded, onToggleWidth, onBack }: {
  agent: string; session: TrackedActivity; expanded: boolean; onToggleWidth: () => void; onBack: () => void;
}) {
  const { snapshot } = agentActivity.use();
  const connection = connector.use();
  const [showCard, setShowCard] = useState(false);
  const [atLatest, setAtLatest] = useState(true);
  const [timeline, setTimeline] = useState<AgentTimeline>();
  const [taskTitle, setTaskTitle] = useState("");
  const [error, setError] = useState(""), [openError, setOpenError] = useState("");
  const loading = session.timeline && !timeline && !error;
  const [now, setNow] = useState(Date.now);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const following = useRef(true), initial = useRef(true), previousRunning = useRef(true), previousTop = useRef(0);
  const manualDisclosure = useRef(false);
  const live = snapshot?.agents[agent]?.sessions.find(s => s.id === session.id);
  const external = session.source === "transcript";
  // Completed history entries do not override a session in the live snapshot.
  const running = !!live || session.endedAt === undefined && !external && !timeline?.readOnly && ["running", "inProgress", "starting", "waiting-permission", "cancelling"].includes(timeline?.status ?? "");

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
  const agentName = name(orderedAgents().find(a => a.agent === agent) ?? { agent });
  const duration = timelineDuration(timeline?.entries ?? [], now, running, nativeSession.turnId, timeline?.turnTimings, nativeSession.turnStartedAt);
  const project = timeline?.projectName || nativeSession.projectName || session.projectName
    || session.project?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const latestSummary = live ? live.dispatchSummary : timeline?.dispatchSummary ?? nativeSession.dispatchSummary;
  const source = latestSummary?.controlSource;
  const knownSource = source?.id ? connection.sources.find(item => item.id === source.id) : undefined;
  const where = knownSource ? connection.status?.ingresses.find(item => item.id === knownSource.ingressId)?.name || knownSource.connectionName : undefined;
  const groups = timelineGroups(timeline?.entries ?? []);
  const turnCount = groups.length;
  const state = taskState(timeline?.status, running, showCard);
  const turnId = nativeSession.turnId || groups.at(-1)?.turnId;
  const control = useTaskControl(agent, session.id, turnId, timeline?.status, !external && !timeline?.readOnly);
  const plan = projectTurn(groups.at(-1)?.entries ?? [], state).plan?.plan ?? [];
  const doneSteps = plan.filter(step => step.status === "completed").length;
  const title = taskTitle || nativeSession.title || session.title || t("timeline.title");
  return <section className="agent-panel-layer task-detail-layer">
    <header className="dialog-header task-detail-header">
      <div className="task-detail-navigation"><Button variant="ghost" onClick={onBack}><Icon icon={ArrowLeft} />{agentName}{project && ` · ${project}`}</Button>
        <div className="actions">{nativeSession.open && <IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => { setOpenError(""); void openActivitySession(agent, nativeSession).catch(error => setOpenError(String(error))); }} />}
          <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")} aria-pressed={expanded} onClick={onToggleWidth} /></div>
      </div>
      <h2 className="activity-panel-title" title={title}>{title}</h2>
      <div className="task-detail-chips"><span className="task-state" data-state={state}>{t(`detail.state.${state}`)}</span>
        {state === "done" && <span className="task-review-status" data-verdict={control.review?.verdict}>{t(control.review?.verdict === "pass" ? "detail.reviewPassed" : control.review?.verdict === "rework" ? "detail.reviewRework" : "detail.awaitingReview")}</span>}
        <div className="task-detail-meta"><SpecPill summary={latestSummary} />{source && <span className="task-source-chip"><SourceBadge source={source} /><span>{t("detail.via", { source: dispatchSourceLabel(source) })}</span>{where && <span className="task-source-where">{where}</span>}</span>}</div>
        {duration !== undefined && <span className="timeline-meta">{durationText(duration)}</span>}
      </div>
      {turnCount > 0 && <div className="task-progress"><div>{plan.map((step, index) => <span key={index} data-state={step.status} />)}</div><span>{t("timeline.turn", { count: turnCount })}{plan.length > 0 && ` · ${t("detail.planProgress", { done: doneSteps, total: plan.length })}`}</span></div>}
    </header>
    <div className="task-timeline" aria-busy={loading}>
      {(error || openError) && <p className="timeline-error" role="alert">{openError || error}</p>}
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
        <div ref={content} className={loading ? "timeline-loading" : "timeline-entries"} onClickCapture={event => {
          if ((event.target as Element).closest("button, .timeline-turn[data-state=closed]")) manualDisclosure.current = true;
        }}>
          {loading ? <LoadingIndicator label={t("timeline.loading")} /> : <>
          {timeline?.coverage.state === "partial" && !timeline.coverage.truncated && <p className="timeline-meta">{t("timeline.partial")}</p>}
          {!session.timeline && <section className="activity-session-summary">
            <span className="timeline-meta">{t(`activity.phase.${nativeSession.phase}`)}</span>
            {(nativeSession.recentContent?.length ? nativeSession.recentContent : [activityHeadline(nativeSession, t("timeline.title")).text])
              .map((text, index) => <p key={index}>{text}</p>)}
          </section>}
          {timeline?.entries.length === 0 && <p className="timeline-meta">{t("timeline.empty")}</p>}
          <TimelineEntries key={session.id} entries={timeline?.entries ?? []} agent={agent} session={nativeSession} now={now} running={running} turnTimings={timeline?.turnTimings} status={timeline?.status} turnStatuses={timeline?.turnStatuses} turnDispatchSummaries={timeline?.turnDispatchSummaries} control={!external && !timeline?.readOnly ? control : undefined} />
          </>}
        </div>
      </div>
      {!atLatest && <Button variant="ghost" className="timeline-latest" onClick={() => {
        const node = viewport.current;
        if (node) { manualDisclosure.current = false; node.scrollTop = node.scrollHeight; following.current = true; setAtLatest(true); }
      }}>{t("timeline.latest")}</Button>}
    </div>
    {!external && !timeline?.readOnly && <footer className="dialog-footer task-detail-footer"><TaskNeedsYou agent={agent} session={nativeSession} entries={timeline?.entries ?? []} source={source && dispatchSourceLabel(source)} onPending={setShowCard} /><TaskControls agent={agent} state={state} control={control} turnId={turnId || undefined} /></footer>}
  </section>;
}
