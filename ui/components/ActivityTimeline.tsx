import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Brain, Check, FileText, ListChecks, MessageSquare, Terminal, Wrench } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import type { AgentActivitySession, AgentTimeline, AgentTimelineEntry } from "../types";
import { agentActivity, openActivitySession } from "../state/activity";
import { followsTimeline, refreshTimeline, timelineScrollTarget } from "../state/timelineModel";
import { useInterval } from "../state/hooks";
import { Button, Dialog, Icon } from "./ui";
import { Markdown } from "./ui/Markdown";
import ActivityInteraction from "./ActivityInteraction";
import FilePath from "./FilePath";
import { activityHeadline, filePathParts } from "../state/activityModel";

const icons = { thinking: Brain, command: Terminal, file: FileText, tool: Wrench };
function TimelineEntry({ entry, agent, session, now }: {
  entry: AgentTimelineEntry; agent: string; session: AgentActivitySession; now: number;
}) {
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
    const pending = entry.status === "pending";
    // The same native request and phase start share the 2B receipt and lock.
    const interactionSession = { ...session, phase: "interaction" as const, headline: entry.interaction?.summary ?? "", phaseSince: entry.startedAt, interaction: entry.interaction };
    const headline = activityHeadline(interactionSession);
    return <article className={`timeline-interaction ${pending ? "needs-attention" : ""}`}>
      <p title={headline.fullText}>{headline.path ? <FilePath path={headline.path} project={session.project} /> : headline.text}</p>
      {pending ? <ActivityInteraction agent={agent} session={interactionSession} questions /> : <span className="timeline-meta">{t(`timeline.status.${entry.status}`)}</span>}
    </article>;
  }
  const kind = entry.type as keyof typeof icons;
  const title = kind === "thinking" ? entry.text?.trim().split("\n").at(-1) || t("activity.phase.thinking")
    : entry.command || entry.path || entry.title || t(`activity.phase.${kind}`);
  return <details className="timeline-detail">
    <summary><Icon icon={icons[kind]} /><span className="timeline-entry-title" title={title}>{kind === "file" && entry.path ? <FilePath path={entry.path} project={session.project || entry.cwd} /> : title}</span>
      <span className={`timeline-status ${entry.status === "failed" ? "activity-error" : ""}`}>{t(`timeline.status.${entry.status}`)}</span><time>{time}</time></summary>
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
export default function ActivityTimeline({ agent, session, onClose }: {
  agent: string; session: AgentActivitySession; onClose: () => void;
}) {
  const { snapshot } = agentActivity.use();
  const [timeline, setTimeline] = useState<AgentTimeline>();
  const [error, setError] = useState(""), [openError, setOpenError] = useState("");
  const [now, setNow] = useState(Date.now);
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const following = useRef(true), initial = useRef(true), previousRunning = useRef(true), previousTop = useRef(0);
  const live = snapshot?.agents[agent]?.sessions.find(s => s.id === session.id);
  const running = timeline?.status ? ["running", "inProgress", "starting", "waiting-permission", "cancelling"].includes(timeline.status) : !!live;
  const followAllowed = useRef(true);
  followAllowed.current = running;
  useInterval(() => setNow(Date.now()), running ? 1000 : null);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>, current: AgentTimeline | undefined;
    async function read() {
      try {
        const next = await refreshTimeline(current, after => api<AgentTimeline>(`agents/timeline/${encodeURIComponent(session.id)}${after === undefined ? "" : `?after=${after}`}`));
        if (stopped) return;
        current = next; setTimeline(next); setError("");
      } catch (error) { if (!stopped) setError(String(error)); }
      if (!stopped) timer = setTimeout(read, 1000);
    }
    void read();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session.id]);
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
  const nativeSession = live?.open ? live : session;
  return <Dialog title={session.title || t("timeline.title")} width={680} onClose={onClose}
    actions={nativeSession.open && <Button variant="ghost" onClick={() => {
      setOpenError(""); void openActivitySession(agent, nativeSession).catch(error => setOpenError(String(error)));
    }}>{t("activity.open")}</Button>}>
    <div className="task-timeline">
      {timeline?.coverage.state === "partial" && <p className="timeline-partial" role="status">{t("timeline.partial")}</p>}
      {(error || openError) && <p className="timeline-error" role="alert">{error || openError}</p>}
      <div className="timeline-scroll" ref={viewport} tabIndex={0} aria-label={t("timeline.title")}
        onWheel={event => { if (event.deltaY < 0) following.current = false; }}
        onScroll={event => {
          const node = event.currentTarget;
          following.current = followsTimeline(node.scrollTop, node.clientHeight, node.scrollHeight, previousTop.current);
          previousTop.current = node.scrollTop;
        }}>
        <div ref={content} className="timeline-entries">
          {!timeline && !error && <p role="status">{t("timeline.loading")}</p>}
          {timeline?.entries.length === 0 && <p className="timeline-meta">{t("timeline.empty")}</p>}
          {timeline?.entries.map(entry => <TimelineEntry key={entry.id} entry={entry} agent={agent} session={nativeSession} now={now} />)}
        </div>
      </div>
    </div>
  </Dialog>;
}
