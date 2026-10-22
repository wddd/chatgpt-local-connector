import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LoaderCircle, Pencil, Wrench, CirclePause, ShieldAlert, ArrowUpRight } from "lucide-react";
import { t } from "../i18n";
import type { AgentPhase } from "../types";
import { activityTimeline, agentActivity } from "../state/activity";
import { activityHeadline, type TrackedActivity } from "../state/activityModel";
import { useInterval } from "../state/hooks";
import { name, orderedAgents } from "../state/agents";
import { Dialog, Icon, Tooltip } from "./ui";
import ActivityTimeline from "./ActivityTimeline";
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
  return <span className={`activity-headline ${!headline.fallback && display.phase === "command" ? "mono" : ""} ${headline.fallback ? "activity-headline-fallback" : ""}`}>
    <AnimatePresence initial={false}>
      <motion.span key={`${display.phase}:${headline.text}`} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : 0.22 }}>
        {headline.path ? <FilePath path={headline.path} project={display.project} /> : headline.text}
      </motion.span>
    </AnimatePresence>
  </span>;
}
function PhaseIcon({ phase, completed }: { phase: AgentPhase; completed: boolean }) {
  if (completed) return <Icon icon={Check} />;
  if (phase === "thinking") return <span className="activity-thinking" aria-hidden="true"><i /><i /><i /></span>;
  if (phase === "text") return <span className="activity-cursor" aria-hidden="true" />;
  return <Icon className={`activity-icon-${phase}`} icon={{ command: LoaderCircle, file: Pencil, tool: Wrench, interaction: ShieldAlert, idle: CirclePause }[phase]} />;
}
export function ActivityBubble({ agent, session, now, onOpen, onMove, listRow = false }: { agent: string; session: TrackedActivity; now: number; onOpen?: () => void; onMove?: (by: number) => void; listRow?: boolean }) {
  const completed = session.endedAt !== undefined, external = session.source === "transcript";
  const phase = session.interaction ? "interaction" : session.phase;
  const phaseLabel = completed ? "activity.completed" : session.interaction?.kind === "question" ? "activity.question" : `activity.phase.${phase}`;
  const hint = t("timeline.open"), headline = activityHeadline(session, t("timeline.title"));
  return <Tooltip text={`${hint} · ${headline.fullText}`}>
    <button type="button" className={`${listRow ? "activity-task-row" : "activity-bubble"} ${session.interaction ? "needs-attention" : ""} ${completed ? "completed" : ""}`}
      data-timeline-anchor
      aria-keyshortcuts={onMove ? "ArrowUp ArrowDown" : undefined} aria-description={onMove ? t("reorderNodeHint") : undefined}
      onKeyDown={event => { if (onMove && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1);
      } }}
      data-activity-session={JSON.stringify([agent, session.id])}
      aria-label={`${session.title || t(phaseLabel)} · ${hint}`} onClick={() => {
        onOpen?.(); activityTimeline.set({ agent, session });
      }}>
      <span className="activity-phase"><PhaseIcon phase={phase} completed={completed} /><span>{t(phaseLabel)}</span>
        {external && <Icon icon={ArrowUpRight} />}<time>{elapsed(session.phaseSince ?? session.startedAt, session.endedAt ?? now)}</time></span>
      <Headline session={session} />
    </button>
  </Tooltip>;
}
export default function ActivityBubbles({ tracked, enabled, listAgent, onListClose, onPanelFrame }: {
  tracked: Record<string, TrackedActivity[]>; enabled: boolean; listAgent?: string; onListClose: () => void;
  onPanelFrame: (rect: import("../motion/surface").SurfaceRect | null) => void;
}) {
  const selected = activityTimeline.use(), { error } = agentActivity.use();
  const [now, setNow] = useState(Date.now);
  useInterval(() => setNow(Date.now()), enabled && !!listAgent ? 1000 : null);
  if (!enabled) return null;
  return <>
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
    {listAgent && <Dialog width={400} title={t("activity.agentTasks", { agent: name(orderedAgents().find(a => a.agent === listAgent) ?? { agent: listAgent }) })} onClose={onListClose}>
      <div className="activity-task-list">{(tracked[listAgent] ?? []).map(session => <ActivityBubble listRow key={session.id} agent={listAgent} session={session} now={now} onOpen={onListClose} />)}</div>
    </Dialog>}
    {selected && <ActivityTimeline key={`${selected.agent}:${selected.session.id}`} agent={selected.agent} session={selected.session} onPanelFrame={onPanelFrame} onClose={() => activityTimeline.set(undefined)} />}
  </>;
}
