import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useSpring } from "motion/react";
import { Check, LoaderCircle, Pencil, Wrench, CirclePause, ShieldAlert, ArrowUpRight } from "lucide-react";
import { t } from "../i18n";
import type { AgentPhase } from "../types";
import { activityTimeline, agentActivity, openActivitySession } from "../state/activity";
import { activityLayout, activityHeadline, activityPorts, visibleActivity, type TrackedActivity } from "../state/activityModel";
import { useInterval } from "../state/hooks";
import { springTransition } from "../motion/geometry";
import { name, orderedAgents } from "../state/agents";
import { Dialog, Icon, Tooltip } from "./ui";
import { useWireFollow, type Painter } from "./ConnectionWires";
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
  const headline = activityHeadline(display);
  return <span className={`activity-headline ${display.phase === "command" ? "mono" : ""}`}>
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
function ActivityBubble({ agent, session, now, onOpen }: { agent: string; session: TrackedActivity; now: number; onOpen?: () => void }) {
  const [opening, setOpening] = useState(false), [error, setError] = useState("");
  const completed = session.endedAt !== undefined, external = session.source === "transcript";
  const phase = session.interaction ? "interaction" : session.phase;
  const phaseLabel = completed ? "activity.completed" : session.interaction?.kind === "question" ? "activity.question" : `activity.phase.${phase}`;
  const canOpen = external ? !!session.open : session.timeline || !!session.open;
  const hint = t(!external && session.timeline ? "timeline.open" : session.open ? "activity.open" : "activity.noEntry");
  return <Tooltip text={error || `${hint}${activityHeadline(session).fullText ? ` · ${activityHeadline(session).fullText}` : ""}`}>
    <button type="button" className={`activity-bubble ${session.interaction ? "needs-attention" : ""} ${completed ? "completed" : ""}`}
      data-timeline-anchor={!external && session.timeline || undefined} aria-disabled={!canOpen || opening}
      data-activity-session={JSON.stringify([agent, session.id])}
      aria-label={`${session.title || t(phaseLabel)} · ${hint}`} onClick={() => {
        if (!canOpen || opening) return;
        setOpening(true); setError("");
        void openActivitySession(agent, session, external ? undefined : selected => {
          onOpen?.(); activityTimeline.set({ agent, session: selected });
        }).catch(error => setError(`${t("activity.openFailed")} ${String(error)}`)).finally(() => setOpening(false));
      }}>
      <span className="activity-phase"><PhaseIcon phase={phase} completed={completed} /><span>{t(phaseLabel)}</span>
        {external && <Icon icon={ArrowUpRight} />}<time>{elapsed(session.phaseSince ?? session.startedAt, session.endedAt ?? now)}</time></span>
      <Headline session={session} />
      {error && <span role="alert" className="sr-only">{error}</span>}
    </button>
  </Tooltip>;
}
const pointOnArc = (cx: number, cy: number, angle: number) => ({
  x: cx + activityLayout.radius * Math.cos(angle * Math.PI / 180),
  y: cy + activityLayout.radius * Math.sin(angle * Math.PI / 180),
});
type BranchProps = { agent: string; nodes: Map<string, HTMLButtonElement>; painters: Map<string, Painter>; follow: () => void };
function OuterArc({ agent, nodes, painters, follow, count, attention, highlighted }: BranchProps & { count: number; attention: boolean; highlighted: boolean }) {
  const path = useRef<SVGPathElement>(null), reduced = useReducedMotion();
  const span = useSpring(activityPorts(count).span, springTransition(0.42, 0.9));
  useMotionValueEvent(span, "change", follow);
  useLayoutEffect(() => { reduced ? span.jump(activityPorts(count).span) : span.set(activityPorts(count).span); follow(); }, [count, reduced, follow, span]);
  useLayoutEffect(() => {
    let previous = "";
    const key = `${agent}:arc`;
    painters.set(key, viewport => {
      const rect = nodes.get(agent)?.getBoundingClientRect();
      if (!rect) return false;
      const cx = (rect.left + rect.right) / 2 - viewport.left, cy = (rect.top + rect.bottom) / 2 - viewport.top;
      const start = pointOnArc(cx, cy, -span.get()), end = pointOnArc(cx, cy, span.get());
      const d = `M ${start.x} ${start.y} A 34 34 0 0 1 ${end.x} ${end.y}`;
      if (d === previous) return false;
      previous = d; path.current?.setAttribute("d", d); return true;
    });
    follow();
    return () => { painters.delete(key); };
  }, [agent, nodes, painters, follow, span]);
  return <svg className={`activity-wires ${highlighted ? "highlighted-wire" : ""}`} aria-hidden="true"><path ref={path} className={`activity-outer-arc ${attention ? "needs-attention" : ""}`} /></svg>;
}
function TaskBranch({ agent, nodes, painters, follow, session, count, index, now, hidden, onAll, selected }: BranchProps & {
  session?: TrackedActivity; count: number; index: number; now: number; hidden: number; onAll: () => void; selected: boolean;
}) {
  const bubble = useRef<HTMLDivElement>(null), path = useRef<SVGPathElement>(null), flow = useRef<SVGPathElement>(null);
  const reduced = useReducedMotion(), angle = useSpring(0, springTransition(0.42, 0.9)), offset = useSpring(0, springTransition(0.42, 0.9));
  const id = session?.id ?? "summary";
  useMotionValueEvent(angle, "change", follow); useMotionValueEvent(offset, "change", follow);
  useLayoutEffect(() => {
    const a = activityPorts(count).angles[index], y = (index - (count - 1) / 2) * activityLayout.pitch;
    if (reduced) { angle.jump(a); offset.jump(y); } else { angle.set(a); offset.set(y); }
    follow();
  }, [count, index, reduced, angle, offset, follow]);
  useLayoutEffect(() => {
    let previous = "";
    const key = JSON.stringify([agent, id]);
    painters.set(key, viewport => {
      const rect = nodes.get(agent)?.getBoundingClientRect();
      if (!rect) return false;
      const cx = (rect.left + rect.right) / 2 - viewport.left, cy = (rect.top + rect.bottom) / 2 - viewport.top;
      const start = pointOnArc(cx, cy, angle.get());
      const bx = cx + activityLayout.nodeGap, by = cy + offset.get();
      const panel = selected ? document.querySelector(".activity-panel")?.getBoundingClientRect() : undefined;
      const end = panel ? { x: panel.left - viewport.left, y: Math.max(panel.top + 27, Math.min(panel.bottom - 27, by + viewport.top)) - viewport.top } : { x: bx, y: by };
      const d = `M ${start.x} ${start.y} C ${start.x + 56} ${start.y} ${end.x - 70} ${end.y} ${end.x} ${end.y}`;
      const signature = `${d}|${bx}|${by}`;
      if (signature === previous) return false;
      previous = signature;
      path.current?.setAttribute("d", d); flow.current?.setAttribute("d", d);
      if (bubble.current) { bubble.current.style.left = `${bx}px`; bubble.current.style.top = `${by - 27}px`; }
      return true;
    });
    const observer = new ResizeObserver(follow);
    const panel = selected && document.querySelector(".activity-panel");
    if (panel) observer.observe(panel);
    follow();
    return () => { painters.delete(key); observer.disconnect(); };
  }, [agent, id, nodes, painters, follow, angle, offset, selected, !!session?.interaction, session?.endedAt, session?.source]);
  const state = !session ? "summary" : session.endedAt !== undefined ? "completed" : session.source === "transcript" ? "external" : session.interaction ? "attention" : "running";
  const fading = !selected && session?.endedAt !== undefined && now >= session.endedAt + activityLayout.hold;
  return <>
    <svg className={`activity-wires task-branch ${selected ? "highlighted-wire" : ""}`} data-state={state} data-fading={fading || undefined} aria-hidden="true">
      <motion.g initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} style={{ originX: 0, transformBox: "fill-box" }} transition={{ duration: reduced ? 0 : 0.3 }}>
        <path ref={path} />
        {state === "running" && <path ref={flow} className="activity-flow" />}
      </motion.g>
    </svg>
    <div ref={bubble} className="activity-slot" data-fading={fading || undefined}>
      <motion.div initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.3 }}>
        {session ? <ActivityBubble agent={agent} session={session} now={now} /> : <button type="button" className="activity-bubble activity-summary" onClick={onAll}>
          <span className="activity-phase">{t("activity.more", { count: hidden })}</span><span className="activity-headline">{t("activity.viewAll")}</span>
        </button>}
      </motion.div>
    </div>
  </>;
}
export interface ActivityBubblesHandle { follow: () => void }
export default function ActivityBubbles({ nodes, graph, boundary, tracked, enabled, ref }: {
  nodes: Map<string, HTMLButtonElement>; graph: RefObject<HTMLDivElement | null>; boundary: RefObject<HTMLElement | null>;
  tracked: Record<string, TrackedActivity[]>; enabled: boolean; ref: Ref<ActivityBubblesHandle>;
}) {
  const selected = activityTimeline.use(), { error } = agentActivity.use();
  const [listAgent, setListAgent] = useState<string>(), [now, setNow] = useState(Date.now);
  const { painters, follow } = useWireFollow(graph);
  useImperativeHandle(ref, () => ({ follow }), [follow]);
  useLayoutEffect(follow, [tracked, selected, enabled, follow]);
  useEffect(() => {
    const observer = new ResizeObserver(follow);
    if (boundary.current) observer.observe(boundary.current);
    if (graph.current) observer.observe(graph.current);
    const element = boundary.current;
    element?.addEventListener("scroll", follow, { passive: true }); window.addEventListener("resize", follow);
    return () => { observer.disconnect(); element?.removeEventListener("scroll", follow); window.removeEventListener("resize", follow); };
  }, [follow]);
  useInterval(() => setNow(Date.now()), enabled && Object.values(tracked).some(s => s.length) ? 1000 : null);
  useEffect(() => {
    const deadlines = Object.values(tracked).flat().flatMap(s => s.endedAt === undefined ? [] : [s.endedAt + activityLayout.hold]).filter(at => at > now);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...deadlines) - Date.now()));
    return () => clearTimeout(timer);
  }, [tracked, now]);
  if (!enabled) return null;
  return <><div className="activity-layer">
    {Object.entries(tracked).filter(([agent, sessions]) => nodes.has(agent) && sessions.length).map(([agent, sessions]) => {
      const shown = visibleActivity(sessions, selected?.agent === agent ? selected.session.id : undefined);
      return <div key={agent}>
        <OuterArc agent={agent} nodes={nodes} painters={painters.current} follow={follow} count={shown.count} attention={sessions.some(s => s.interaction)} highlighted={selected?.agent === agent} />
        {shown.sessions.map((session, index) => <TaskBranch key={session.id} agent={agent} nodes={nodes} painters={painters.current} follow={follow}
          session={session} count={shown.count} index={index} now={now} hidden={0} onAll={() => setListAgent(agent)} selected={selected?.agent === agent && selected.session.id === session.id} />)}
        {!!shown.hidden && <TaskBranch agent={agent} nodes={nodes} painters={painters.current} follow={follow} count={shown.count} index={4}
          now={now} hidden={shown.hidden} onAll={() => setListAgent(agent)} selected={false} />}
      </div>;
    })}
    {error && <span className="sr-only" role="status">{t("activity.disconnected")}</span>}
  </div>
    {listAgent && <Dialog width={400} title={t("activity.agentTasks", { agent: name(orderedAgents().find(a => a.agent === listAgent) ?? { agent: listAgent }) })} onClose={() => setListAgent(undefined)}>
      <div className="activity-task-list">{(tracked[listAgent] ?? []).map(session => <ActivityBubble key={session.id} agent={listAgent} session={session} now={now} onOpen={() => setListAgent(undefined)} />)}</div>
    </Dialog>}
    {selected && <ActivityTimeline key={`${selected.agent}:${selected.session.id}`} agent={selected.agent} session={selected.session} onMotion={follow} onClose={() => activityTimeline.set(undefined)} />}
  </>;
}
