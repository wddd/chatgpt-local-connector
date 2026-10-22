import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { t } from "../i18n";
import { PhaseTile, PhaseLabel, StepTrail } from "./activity";
import { selectAgentPanel } from "../state/overviewPanels";
import { activityHeadline, type TrackedActivity } from "../state/activityModel";
import { useInterval } from "../state/hooks";
import FilePath from "./FilePath";

export function elapsed(since: string | null | undefined, now: number) {
  const seconds = since ? Math.max(0, Math.floor((now - Date.parse(since)) / 1000)) : NaN;
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return t("activity.seconds", { count: seconds });
  if (seconds < 3600) return t("activity.minutes", { count: Math.floor(seconds / 60) });
  return t("activity.hours", { count: Math.floor(seconds / 3600), minutes: Math.floor(seconds / 60) % 60 });
}
function Headline({ session }: { session: TrackedActivity }) {
  const reduced = useReducedMotion(), latest = useRef(session);
  latest.current = session;
  const [display, setDisplay] = useState(session);
  useInterval(() => setDisplay(latest.current), 1000);
  const headline = activityHeadline(display, t("timeline.title"));
  return <span className={`activity-headline ${!headline.fallback && (display.phase === "command" || !!headline.path) ? "mono" : ""} ${headline.fallback ? "activity-headline-fallback" : ""}`}>
    <AnimatePresence initial={false}>
      <motion.span key={`${display.phase}:${headline.text}`} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        {headline.path ? <FilePath path={headline.path} project={display.project} /> : headline.text}
      </motion.span>
    </AnimatePresence>
  </span>;
}
export function ActivityBubble({ agent, session, now, onMove }: { agent: string; session: TrackedActivity; now: number; onMove?: (by: number) => void }) {
  const completed = session.endedAt !== undefined, external = session.source === "transcript";
  const running = !completed && !external && !session.interaction && session.phase !== "idle";
  const unread = completed && session.readAt === undefined;
  const phase = session.interaction ? "interaction" : session.phase;
  const phaseLabel = completed ? "activity.completed" : session.interaction?.kind === "question" ? "activity.question" : `activity.phase.${phase}`;
  const hint = t("timeline.open");
  return <button type="button" className={`activity-bubble ${session.interaction ? "needs-attention" : ""} ${completed ? "completed" : ""}`}
      data-external={external || undefined}
      data-timeline-anchor
      data-unread={unread || undefined}
      aria-keyshortcuts={onMove ? "ArrowUp ArrowDown" : undefined} aria-description={onMove ? t("reorderNodeHint") : undefined}
      onKeyDown={event => { if (onMove && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1);
      } }}
      data-activity-session={JSON.stringify([agent, session.id])}
      aria-label={`${session.title || t(phaseLabel)}${unread ? ` · ${t("activity.unread")}` : ""} · ${hint}`} onClick={() => {
        selectAgentPanel({ type: "task", agent, session });
      }}>
      <PhaseTile phase={phase} running={running} completed={completed} animated={!external} />
      <span className="activity-copy">
        <span className="activity-phase">
          <PhaseLabel phase={phase} running={running} completed={completed}>{t(phaseLabel)}</PhaseLabel>
          {session.origin?.controlSource === "local-cli" && <span>{t("localCli")}</span>}
          <StepTrail steps={session.recentSteps} running={running} />
          {unread && <span className="activity-unread" role="img" aria-label={t("activity.unread")} />}
          <time>{elapsed(session.turnStartedAt, session.endedAt ?? now)}</time>
        </span>
        <Headline session={session} />
      </span>
    </button>;
}
