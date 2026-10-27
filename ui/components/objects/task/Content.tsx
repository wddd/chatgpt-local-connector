import { DispatchSpec } from "../../composites/DispatchSpec";
import { useReducedMotion } from "../../../state/appEnvironment";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { locale, t } from "../../../i18n";
import { PhaseTile, PhaseLabel, StepTrail, dispatchSourceLabel } from "../../activity";
import { activityHeadline, type TrackedActivity, type BubbleDensity } from "../../../state/activityModel";
import { useInterval } from "../../../state/hooks";
import FilePath from "../../FilePath";

export function elapsed(since: string | null | undefined, now: number) {
  const seconds = since ? Math.max(0, Math.floor((now - Date.parse(since)) / 1000)) : NaN;
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60), remainder = String(seconds % 60).padStart(2, "0");
  return seconds < 3600 ? `${minutes}:${remainder}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${remainder}`;
}
function Headline({ session }: { session: TrackedActivity }) {
  const reduced = useReducedMotion(), latest = useRef(session);
  latest.current = session;
  const [display, setDisplay] = useState(session);
  useInterval(() => setDisplay(latest.current), 1000);
  const headline = display.interaction ? { text: display.interaction.summary, path: undefined, fallback: false } : activityHeadline(display, t("timeline.title"));
  return <span className={`activity-headline ${!headline.fallback && (display.phase === "command" || !!headline.path) ? "mono" : ""} ${headline.fallback ? "activity-headline-fallback" : ""}`}>
    <AnimatePresence initial={false}>
      <motion.span key={`${display.phase}:${headline.text}`} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        {headline.path ? <FilePath path={headline.path} project={display.project} /> : headline.text}
      </motion.span>
    </AnimatePresence>
  </span>;
}
export function ActivityBubbleContent({ agent, session, now, density = "standard", historical = false, conversationRow = false, showSourceBadge = true }: { agent: string; session: TrackedActivity; now: number; density?: BubbleDensity; historical?: boolean; conversationRow?: boolean; showSourceBadge?: boolean }) {
  const language = locale.use();
  const paused = ["cancelled", "interrupted", "aborted"].includes(session.status ?? "");
  const completed = !paused && (session.endedAt !== undefined || historical), external = session.source === "transcript";
  const running = !paused && !completed && !external && !session.interaction && session.phase !== "idle";
  const unread = completed && !historical && session.readAt === undefined;
  const phase = session.interaction ? "interaction" : session.phase;
  const phaseLabel = completed ? "activity.completed" : session.interaction ? "activity.waitingConfirm" : `activity.phase.${phase}`;
  const source = session.dispatchSummary?.controlSource;
  const project = session.projectName || session.project?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const previous = session.recentContent?.filter(text => text !== activityHeadline(session).text).at(-1);
  const duration = elapsed(session.turnStartedAt, session.endedAt ?? now);
  const detail = session.interaction ? t("activity.pendingHint") : completed ? duration === "—" ? undefined : t("activity.totalDuration", { duration }) : previous;
  const created = Date.parse(session.startedAt ?? "");
  const conversation = conversationRow;
  const createdTime = Number.isFinite(created) && <time className="activity-created" dateTime={session.startedAt!}
    title={t("agentPanel.created", { time: new Date(created).toLocaleString(language) })}>
    {new Date(created).toLocaleDateString(language, { ...(new Date(created).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } as const : {}), month: "short", day: "numeric" })}
  </time>;
  return <>
    <PhaseTile phase={phase} running={running} completed={completed} paused={paused} animated={!external} source={showSourceBadge ? source : undefined} />
    {historical && <span className="sr-only">{t(paused ? "timeline.status.cancelled" : "activity.completed")}</span>}
    <span className="activity-copy">
      <span className="activity-title-row"><strong>{session.title || t("timeline.title")}</strong>
        {unread && <span className="activity-unread" role="img" aria-label={t("activity.unread")} />}
        {session.interaction ? <span className="activity-pending">{t("activity.pending")}</span> : !historical && <time>{elapsed(session.turnStartedAt, session.endedAt ?? now)}</time>}
      </span>
      {(!historical || !conversation) && <span className="activity-phase">
        {historical ? createdTime : <>
          <PhaseLabel phase={phase} running={running} completed={completed}>{t(phaseLabel)}</PhaseLabel>
          <Headline session={session.interaction ? { ...session, headline: session.interaction.summary } : session} />
        </>}
      </span>}
      {density === "detailed" && <span className="activity-detail-line" title={detail}>{detail || "\u00a0"}</span>}
      {density !== "compact" && <span className={`activity-spec-row ${conversation ? "activity-conversation-meta" : ""}`}>
        {conversation && project && <span className="activity-project" title={session.project!}>{project}</span>}
        <DispatchSpec agent={agent} record={{ kind: "session", value: session }} variant="inline" />
        {conversation && !!session.turnCount && <span className="activity-spec">{t("timeline.turnCount", { count: session.turnCount })}</span>}
        {!conversation && project && <span className="activity-project" title={session.project!}>{project}</span>}
        {density === "detailed" && source && <span className="activity-source-name" title={dispatchSourceLabel(source)}>{dispatchSourceLabel(source)}</span>}
        {conversation ? createdTime : <StepTrail steps={session.recentSteps} running={running} />}
      </span>}
    </span>
  </>;
}
