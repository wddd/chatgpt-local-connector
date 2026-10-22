import type { ReactNode } from "react";
import { t } from "../i18n";
import type { WireState } from "../topology/render";

export default function GraphNode({ label, state, onOpen, onMove, highlighted, children }: {
  label: string; state: WireState; onOpen: () => void; onMove?: (by: number) => void;
  highlighted?: boolean; children: ReactNode;
}) {
  return <button type="button" className="graph-node" data-panel-anchor
    data-highlighted={highlighted || undefined} data-connection-state={state}
    aria-label={label} aria-haspopup="dialog" aria-description={onMove ? t("reorderNodeHint") : undefined}
    aria-keyshortcuts={onMove ? "ArrowUp ArrowDown" : undefined} onClick={onOpen}
    onKeyDown={event => {
      if (onMove && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1);
      }
    }}>{children}</button>;
}
