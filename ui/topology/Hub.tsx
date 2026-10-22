import { useId } from "react";
import { t } from "../i18n";

export default function Hub({ sourceEmpty, agentEmpty, onAddSource, onManageAgents }: {
  sourceEmpty: boolean; agentEmpty: boolean; onAddSource: () => void; onManageAgents: () => void;
}) {
  const id = useId();
  return <>
    <svg className="graph-brand" viewBox="4 4 92 92" role="img" aria-label="Agent Remote Control">
      <defs><linearGradient id={`${id}-arc`} gradientUnits="userSpaceOnUse" x1="18" y1="50" x2="92" y2="50">
        <stop stopColor="var(--mark-agent-start)" /><stop offset="1" stopColor="var(--mark-agent-end)" />
      </linearGradient></defs>
      <path d="M23.35 32.29 A32 32 0 0 1 76.65 32.29" fill="none" stroke="var(--topology-source)" strokeWidth="9" strokeLinecap="round" />
      <path d="M76.65 67.71 A32 32 0 0 1 23.35 67.71" fill="none" stroke={`url(#${id}-arc)`} strokeWidth="9" strokeLinecap="round" />
    </svg>
    {(["source", "agent"] as const).map(side => {
      const source = side === "source", empty = source ? sourceEmpty : agentEmpty;
      const label = t(source ? "addControlSource" : empty ? "addAgent" : "manageAgents");
      return <button key={side} type="button" className={`hub-entry hub-${side}`} data-empty={empty || undefined}
        data-panel-anchor aria-label={label} onClick={source ? onAddSource : onManageAgents}>
        <span className="hub-dot" data-panel-visual>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-${side}-fill`} gradientUnits="userSpaceOnUse" x1="-54" y1="10" x2="20" y2="10">
                <stop stopColor="var(--mark-agent-start)" /><stop offset="1" stopColor="var(--mark-agent-end)" />
              </linearGradient>
              <mask id={`${id}-${side}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="20" height="20" style={{ maskType: "luminance" }}>
                <rect width="20" height="20" fill="white" />
                <g className="hub-symbol" fill="black" stroke="black" strokeWidth="2.5" strokeLinecap="round">
                  {source || empty ? <path d="M2.5 10H17.5 M10 2.5V17.5" />
                    : <g stroke="none"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></g>}
                </g>
              </mask>
            </defs>
            <circle cx="10" cy="10" r="10" fill={source ? "var(--topology-source)" : `url(#${id}-${side}-fill)`} mask={`url(#${id}-${side}-mask)`} />
          </svg>
        </span>
        {empty && <span className="hub-hint" aria-hidden="true">{label}</span>}
      </button>;
    })}
  </>;
}
