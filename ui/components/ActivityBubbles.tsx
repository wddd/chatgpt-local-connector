import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Brain, Terminal, FileText, Wrench, MessageSquare, CirclePause, CircleHelp, ShieldAlert, AlertCircle } from "lucide-react";
import { t } from "../i18n";
import type { AgentActivitySession, AgentPhase } from "../types";
import { activityApprovals, agentActivity, openActivitySession, submitActivityApproval } from "../state/activity";
import { activityLayout, interactionKey, permissionResponse, visibleActivity } from "../state/activityModel";
import { useInterval } from "../state/hooks";
import { Button, Icon, Tooltip } from "./ui";

const phaseIcons = { thinking: Brain, command: Terminal, file: FileText, tool: Wrench, text: MessageSquare, interaction: ShieldAlert, idle: CirclePause };
function elapsed(since: string | null | undefined, now: number) {
  const seconds = since ? Math.max(0, Math.floor((now - Date.parse(since)) / 1000)) : NaN;
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return t("activity.seconds", { count: seconds });
  if (seconds < 3600) return t("activity.minutes", { count: Math.floor(seconds / 60) });
  return t("activity.hours", { count: Math.floor(seconds / 3600), minutes: Math.floor(seconds / 60) % 60 });
}
function Headline({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const latest = useRef(text);
  latest.current = text;
  const [display, setDisplay] = useState(text);
  useInterval(() => setDisplay(latest.current), 1000);
  return <span className="activity-headline">
    <AnimatePresence initial={false}>
      <motion.span key={display} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>{display || t("activity.noHeadline")}</motion.span>
    </AnimatePresence>
  </span>;
}
function ActivityBubble({ agent, session, now, overflow = 0 }: { agent: string; session: AgentActivitySession; now: number; overflow?: number }) {
  const submissions = activityApprovals.use();
  const submission = submissions[interactionKey(agent, session)];
  const [opening, setOpening] = useState(false), [openError, setOpenError] = useState("");
  const interaction = session.interaction;
  const phase: AgentPhase = interaction ? "interaction" : session.phase;
  const phaseLabel = interaction?.kind === "question" ? "activity.question" : `activity.phase.${phase}`;
  const hint = session.open ? t("activity.open") : t(session.timeline ? "activity.timelineLater" : "activity.noEntry");
  const content = <>
    <span className="activity-phase"><Icon icon={interaction?.kind === "question" ? CircleHelp : phaseIcons[phase]} />
      <span>{t(phaseLabel)}</span><time>{elapsed(session.phaseSince ?? session.startedAt, now)}</time>
      {overflow > 0 && <span className="activity-more" title={t("activity.more", { count: overflow })}>+{overflow}</span>}</span>
    <Headline text={session.headline} />
  </>;
  const feedback = submission?.status === "submitted" ? t("activity.submitted")
    : submission?.status === "unconfirmed" ? t("activity.unconfirmed") : "";
  return <article className={`activity-bubble ${interaction ? "needs-attention" : ""}`} aria-label={session.title || t(phaseLabel)}>
    <Tooltip text={`${hint}${session.headline ? ` · ${session.headline}` : ""}`}>
      {session.open ? <Button variant="ghost" className="activity-summary" disabled={opening} onClick={() => {
        setOpening(true); setOpenError("");
        void openActivitySession(agent, session).catch(error => setOpenError(String(error))).finally(() => setOpening(false));
      }}>{content}</Button> : <div className="activity-summary" tabIndex={0} aria-label={hint}>{content}</div>}
    </Tooltip>
    {interaction?.kind === "permission" && <div className="activity-actions">
      {feedback ? <span role="status" title={submission?.error}>{feedback}</span> : <>
        {(["allow", "deny"] as const).map(decision => <Button key={decision} variant="ghost"
          disabled={!permissionResponse(interaction, decision) || (!!submission && submission.decision !== decision)}
          busy={submission?.status === "submitting" && submission.decision === decision}
          onClick={() => void submitActivityApproval(agent, session, decision)}>
          {submission?.decision === decision && submission.status === "pending" ? t("activity.checkResult") : t(`activity.${decision}`)}
        </Button>)}
        {submission?.status === "failed" && <Tooltip text={`${t("activity.failed")} ${submission.error || ""}`}>
          <span className="activity-error" tabIndex={0} role="alert" aria-label={`${t("activity.failed")} ${submission.error || ""}`}><Icon icon={AlertCircle} /></span>
        </Tooltip>}
      </>}
    </div>}
    {interaction?.kind === "question" && <span className="activity-note">{t(session.open ? "activity.questionOpen" : "activity.questionPending")}</span>}
    {openError && <Tooltip text={`${t("activity.openFailed")} ${openError}`}><span className="activity-open-error" role="alert" tabIndex={0} aria-label={`${t("activity.openFailed")} ${openError}`}><Icon icon={AlertCircle} /></span></Tooltip>}
  </article>;
}
export interface ActivityBubblesHandle { follow: () => void }
type Position = { agent: string; left: number; top: number; available: number };
export default function ActivityBubbles({ nodes, graph, boundary, hidden, enabled, ref }: {
  nodes: Map<string, HTMLButtonElement>;
  graph: RefObject<HTMLDivElement | null>;
  boundary: RefObject<HTMLElement | null>;
  hidden: ReadonlySet<string>;
  enabled: boolean;
  ref: Ref<ActivityBubblesHandle>;
}) {
  const { snapshot, error } = agentActivity.use();
  const [positions, setPositions] = useState<Position[]>([]), [now, setNow] = useState(Date.now);
  const frame = useRef(0), stable = useRef(0), last = useRef("");
  const measure = useRef(() => {});
  measure.current = () => {
    frame.current = 0;
    if (!enabled || !graph.current || !boundary.current) return;
    const origin = graph.current.getBoundingClientRect(), bounds = boundary.current.getBoundingClientRect();
    const next = [...nodes].flatMap(([agent, node]) => {
      const rect = node.getBoundingClientRect();
      if (!snapshot?.agents[agent]?.sessions.length || hidden.has(agent) || rect.bottom < bounds.top || rect.top > bounds.bottom) return [];
      return [{ agent, left: rect.right - origin.left + activityLayout.nodeGap, top: rect.top - origin.top + rect.height / 2,
        available: Math.min(bounds.right, window.innerWidth) - rect.right - activityLayout.nodeGap - activityLayout.edge }];
    });
    const signature = JSON.stringify(next);
    if (signature !== last.current) { last.current = signature; stable.current = 0; setPositions(next); }
    else stable.current++;
    if (stable.current < 8) frame.current = requestAnimationFrame(() => measure.current());
  };
  const follow = () => { stable.current = 0; if (!frame.current) frame.current = requestAnimationFrame(() => measure.current()); };
  useImperativeHandle(ref, () => ({ follow }));
  useLayoutEffect(follow, [snapshot, enabled, hidden]);
  useEffect(() => {
    const observer = new ResizeObserver(follow);
    if (boundary.current) observer.observe(boundary.current);
    if (graph.current) observer.observe(graph.current);
    const element = boundary.current;
    element?.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow);
    return () => { observer.disconnect(); element?.removeEventListener("scroll", follow); window.removeEventListener("resize", follow); cancelAnimationFrame(frame.current); frame.current = 0; };
  }, []);
  useInterval(() => setNow(Date.now()), enabled && positions.length > 0 ? 1000 : null);
  if (!enabled) return null;
  return <div className="activity-layer">
    {positions.map(position => {
      const sessions = snapshot?.agents[position.agent]?.sessions ?? [];
      const visible = visibleActivity(sessions, position.available);
      if (!visible.sessions.length || hidden.has(position.agent)) return null;
      return <div className="activity-row" key={position.agent} style={{ left: position.left, top: position.top }}>
        {visible.sessions.map((session, index) => <div key={session.id} style={{ width: visible.width }}><ActivityBubble agent={position.agent} session={session} now={now} overflow={index === visible.sessions.length - 1 ? visible.hidden : 0} /></div>)}
        {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
      </div>;
    })}
  </div>;
}
