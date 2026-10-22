import { useId, type CSSProperties, type ReactNode } from "react";
import { Brain, Terminal, Pencil, Wrench, MessageSquare, ShieldAlert, CirclePause, Check } from "lucide-react";
import type { AgentPhase } from "../../types";
import { Icon } from "../ui";
import "./activity.css";

export function PhaseTile({ phase, running = false, completed = false, animated = true }: {
  phase: AgentPhase; running?: boolean; completed?: boolean; animated?: boolean;
}) {
  const mask = useId();
  const drawing = animated && (completed || (running && phase === "file"));
  return <span className="phase-tile" style={drawing ? { "--phase-mask": `url(#${mask})` } as CSSProperties : undefined} data-phase={completed ? "completed" : phase}
    data-running={running || undefined} data-animated={animated || undefined} aria-hidden="true">
    {drawing && <svg className="phase-mask" width="0" height="0"><defs>
      <mask id={mask} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
        <rect className="phase-stroke-reveal" width="1" height="1" fill="white" />
      </mask>
    </defs></svg>}
    <Icon icon={completed ? Check : { thinking: Brain, command: Terminal, file: Pencil, tool: Wrench,
      text: MessageSquare, interaction: ShieldAlert, idle: CirclePause }[phase]} />
  </span>;
}
export function PhaseLabel({ phase, running = false, completed = false, children }: {
  phase: AgentPhase; running?: boolean; completed?: boolean; children: ReactNode;
}) {
  return <span className="phase-label" data-phase={completed ? "completed" : phase} data-running={running || undefined}>{children}</span>;
}
export function StepTrail({ steps = [], running = false }: {
  steps?: Exclude<AgentPhase, "idle">[]; running?: boolean;
}) {
  return <span className="step-trail" data-running={running || undefined} aria-hidden="true">
    {steps.slice(-5).map((phase, index) => <i key={index} data-phase={phase} />)}
  </span>;
}
