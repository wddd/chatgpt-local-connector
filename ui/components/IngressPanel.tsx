import { useReducedMotion } from "../state/appEnvironment";
import { motion } from "motion/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { t } from "../i18n";
import { connector } from "../state/connector";
import { ingressPanel } from "../state/overviewPanels";
import type { SurfaceRect } from "../motion/surface";
import SourcePanel from "./SourcePanel";
import { Dialog, IconButton, Notice } from "./ui";

export default function IngressPanel({ onPanelFrame, width, expanded, onToggleWidth, dockRect }: {
  onPanelFrame: (rect: SurfaceRect | null) => void; width?: number; dockRect?: SurfaceRect; expanded: boolean; onToggleWidth: () => void;
}) {
  const selected = ingressPanel.use()!, { status, sources } = connector.use();
  const entry = status?.ingresses.find(i => i.id === selected.ingress.id) ?? selected.ingress;
  const source = sources.find(s => s.id === selected.client?.id) ?? sources.find(s => s.ingressId === entry.id && s.state !== "revoked");
  const client = source ? { id: source.id, name: source.label, source: source.product } : selected.client;
  const reduced = useReducedMotion();
  return <Dialog width={width} dockRect={dockRect} dock="left" expanded={expanded} headerless title={client?.name ?? entry.name}
    originKey={client?.id ?? entry.id} closeRequested={selected.closing}
    onCloseStart={() => ingressPanel.set(old => old?.ingress.id === entry.id && old.client?.id === selected.client?.id ? { ...old, closing: true } : old)}
    onClose={() => { const current = ingressPanel.get(); if (current?.ingress.id === entry.id && current.client?.id === selected.client?.id && current.closing) ingressPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(client ? client.id : entry.id)}"] button`} onPanelFrame={onPanelFrame}>
    <motion.div className="side-panel-layer flex h-full min-h-0 w-full flex-col [&>.dialog-header]:shrink-0 [&>.dialog-footer]:shrink-0 [&>.dialog-header>.source-icon]:size-8" key={entry.id}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        {source ? <SourcePanel key={source.id} source={source} widthControl={!dockRect && <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")} aria-pressed={expanded} onClick={onToggleWidth} />} /> : <Notice>{t("accounts.unidentified")}</Notice>}
    </motion.div>
  </Dialog>;
}
