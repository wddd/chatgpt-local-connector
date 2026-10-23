import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { locale, t } from "../i18n";
import { PhaseTile, PhaseLabel, StepTrail, SpecPill, dispatchSourceLabel } from "./activity";
import { selectAgentPanel } from "../state/overviewPanels";
import { activityHeadline, type TrackedActivity, type BubbleDensity } from "../state/activityModel";
import { useInterval } from "../state/hooks";
import FilePath from "./FilePath";

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
export function ActivityBubbleContent({ session, now, density = "standard", historical = false }: { session: TrackedActivity; now: number; density?: BubbleDensity; historical?: boolean }) {
  const language = locale.use();
  const completed = session.endedAt !== undefined, external = session.source === "transcript";
  const running = !completed && !external && !session.interaction && session.phase !== "idle";
  const unread = completed && session.readAt === undefined;
  const phase = session.interaction ? "interaction" : session.phase;
  const phaseLabel = completed ? "activity.completed" : session.interaction ? "activity.waitingConfirm" : `activity.phase.${phase}`;
  const source = session.dispatchSummary?.controlSource;
  const project = session.projectName || session.project?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const previous = session.recentContent?.filter(text => text !== activityHeadline(session).text).at(-1);
  const duration = elapsed(session.turnStartedAt, session.endedAt ?? now);
  const detail = session.interaction ? t("activity.pendingHint") : completed ? duration === "—" ? undefined : t("activity.totalDuration", { duration }) : previous;
  const created = Date.parse(session.startedAt ?? "");
  return <>
    <PhaseTile phase={phase} running={running} completed={completed} animated={!external} source={source} />
    <span className="activity-copy">
      <span className="activity-title-row"><strong title={session.title}>{session.title || t("timeline.title")}</strong>
        {unread && <span className="activity-unread" role="img" aria-label={t("activity.unread")} />}
        {session.interaction ? <span className="activity-pending">{t("activity.pending")}</span> : !historical && <time>{elapsed(session.turnStartedAt, session.endedAt ?? now)}</time>}
      </span>
      <span className="activity-phase">
        {historical ? Number.isFinite(created) && <time className="activity-created" dateTime={session.startedAt!}>
          {t("agentPanel.created", { time: new Date(created).toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" }) })}
        </time> : <>
          <PhaseLabel phase={phase} running={running} completed={completed}>{t(phaseLabel)}</PhaseLabel>
          <Headline session={session.interaction ? { ...session, headline: session.interaction.summary } : session} />
        </>}
      </span>
      {density === "detailed" && <span className="activity-detail-line" title={detail}>{detail || "\u00a0"}</span>}
      {density !== "compact" && <span className="activity-spec-row">
        <SpecPill summary={session.dispatchSummary} />
        {project && <span className="activity-project" title={session.project!}>{project}</span>}
        {density === "detailed" && source && <span className="activity-source-name" title={dispatchSourceLabel(source)}>{dispatchSourceLabel(source)}</span>}
        <StepTrail steps={session.recentSteps} running={running} />
      </span>}
    </span>
  </>;
}
export function ActivityBubble({ agent, session, now, onMove, density = "standard" }: { agent: string; session: TrackedActivity; now: number; density?: BubbleDensity; onMove?: (by: number) => void }) {
  const completed = session.endedAt !== undefined, unread = completed && session.readAt === undefined;
  const hint = t("timeline.open");
  return <button type="button" className={`activity-bubble ${session.interaction ? "needs-attention" : ""} ${completed ? "completed" : ""}`}
      data-density={density} data-external={session.source === "transcript" || undefined}
      data-timeline-anchor
      data-unread={unread || undefined}
      aria-keyshortcuts={onMove ? "ArrowUp ArrowDown" : undefined} aria-description={onMove ? t("reorderNodeHint") : undefined}
      onKeyDown={event => { if (onMove && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1);
      } }}
      data-activity-session={JSON.stringify([agent, session.id])}
      aria-label={`${session.title || t("timeline.title")}${unread ? ` · ${t("activity.unread")}` : ""} · ${hint}`} onClick={() => {
        selectAgentPanel({ type: "task", agent, session });
      }}>
      <ActivityBubbleContent session={session} now={now} density={density} />
    </button>;
}
