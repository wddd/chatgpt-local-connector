import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { ArrowUpRight, ArrowLeft, X } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import type { AgentTimeline } from "../types";
import { activityApprovals, agentActivity, openActivitySession } from "../state/activity";
import { interactionTool, permissionRequestLabel, followsTimeline, refreshTimeline, timelineScrollTarget } from "../state/timelineModel";
import { useInterval } from "../state/hooks";
import { Button, IconButton, Tooltip } from "./ui";
import TimelineEntries from "./TimelineEntries";
import ActivityInteraction from "./ActivityInteraction";
import FilePath from "./FilePath";
import { activityHeadline, interactionKey, type TrackedActivity } from "../state/activityModel";

import { name, orderedAgents } from "../state/agents";

export default function ActivityTimeline({ agent, session, onClose, onBack }: {
  agent: string; session: TrackedActivity; onClose: () => void; onBack: () => void;
}) {
  const { snapshot } = agentActivity.use();
  const submissions = activityApprovals.use(), cardId = useId();
  const [atLatest, setAtLatest] = useState(true);
  const [timeline, setTimeline] = useState<AgentTimeline>();
  const [error, setError] = useState(""), [openError, setOpenError] = useState("");
  const [now, setNow] = useState(Date.now);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const following = useRef(true), initial = useRef(true), previousRunning = useRef(true), previousTop = useRef(0);
  const live = snapshot?.agents[agent]?.sessions.find(s => s.id === session.id);
  const external = session.source === "transcript";
  // Completed history entries do not override a session in the live snapshot.
  const running = !!live || session.endedAt === undefined && !external && ["running", "inProgress", "starting", "waiting-permission", "cancelling"].includes(timeline?.status ?? "");
  const completedAt = useRef(session.endedAt);
  if (running) completedAt.current = undefined;
  else completedAt.current ??= session.endedAt ?? now;
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
  const startedAt = nativeSession.turnStartedAt ?? nativeSession.startedAt;
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
    duration === undefined ? undefined : t("activity.seconds", { count: duration })].filter(Boolean).join(" · ");
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
      <h2 className="activity-panel-title">{agentName} / {session.title || t("timeline.title")}</h2>
      <div className="actions">
        {nativeSession.open && <Tooltip text={t("activity.open")}><IconButton icon={ArrowUpRight} label={t("activity.open")} onClick={() => {
          setOpenError(""); void openActivitySession(agent, nativeSession).catch(error => setOpenError(String(error)));
        }} /></Tooltip>}
        <IconButton icon={X} label={t("close")} onClick={onClose} />
      </div>
      <div className="activity-panel-subline">
        <span className="activity-status" data-state={showCard ? "attention" : running ? "running" : "completed"}>
          {t(showCard ? pendingSession.interaction?.kind === "question" ? "activity.question" : "activity.phase.interaction" : running ? "timeline.status.running" : "activity.completed")}
        </span><span className="activity-panel-meta" title={subtitle}>{subtitle}</span>
      </div>
    </header>
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
          {timeline?.coverage.state === "partial" && <p className="timeline-meta">{t("timeline.truncated")}</p>}
          {external && <p className="timeline-meta">{t("timeline.external")}</p>}
          {!timeline && session.timeline && !error && <p role="status">{t("timeline.loading")}</p>}
          {(!session.timeline || !timeline?.entries.length && (external || !!error)) && <section className="activity-session-summary">
            <span className="timeline-meta">{t(`activity.phase.${nativeSession.phase}`)}</span>
            {(nativeSession.recentContent?.length ? nativeSession.recentContent : [activityHeadline(nativeSession, t("timeline.title")).text])
              .map((text, index) => <p key={index}>{text}</p>)}
          </section>}
          {!external && timeline?.entries.length === 0 && <p className="timeline-meta">{t("timeline.empty")}</p>}
          <TimelineEntries key={session.id} entries={timeline?.entries ?? []} agent={agent} session={nativeSession} now={now} />
        </div>
      </div>
      {!atLatest && <Button variant="ghost" className="timeline-latest" onClick={() => {
        const node = viewport.current;
        if (node) { node.scrollTop = node.scrollHeight; following.current = true; setAtLatest(true); }
      }}>{t("timeline.latest")}</Button>}
    </div>
    {footer && <footer className="dialog-footer">{footer}</footer>}
  </section>;
}
