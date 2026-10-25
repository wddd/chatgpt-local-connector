import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { connector, refreshConnector } from "../state/connector";
import { ingressPanel, selectIngressPanel } from "../state/overviewPanels";
import type { SurfaceRect } from "../motion/surface";
import IngressDialog from "./IngressDialog";
import SourcePanel from "./SourcePanel";
import ChangeConnection from "./ChangeConnection";
import { connectionSwitch } from "../state/onboarding";
import { Dialog, IconButton, Notice } from "./ui";

export default function IngressPanel({ onPanelFrame, width, expanded, onToggleWidth }: {
  onPanelFrame: (rect: SurfaceRect | null) => void; width?: number; expanded: boolean; onToggleWidth: () => void;
}) {
  const switching = connectionSwitch.use();
  const selected = ingressPanel.use()!, { status, sources } = connector.use();
  const entry = status?.ingresses.find(i => i.id === selected.ingress.id) ?? selected.ingress;
  const source = sources.find(s => s.id === selected.client?.id) ?? sources.find(s => s.ingressId === entry.id && s.state !== "revoked");
  const client = source ? { id: source.id, name: source.label, source: source.product } : selected.client;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const currentId = useRef(entry.id); currentId.current = entry.id;
  useEffect(() => { setError(""); }, [entry.id]);
  useEffect(() => {
    if (!selected.autoConnect) return;
    ingressPanel.set(old => old?.ingress.id === entry.id ? { ...old, autoConnect: false } : old);
    setBusy(true);
    void api(`ingress/${entry.id}/start`, "POST").then(refreshConnector)
      .catch(() => { if (currentId.current === entry.id) setError(t("connect.actionFailed")); })
      .finally(() => { if (currentId.current === entry.id) setBusy(false); });
  }, [entry.id, selected.autoConnect]);
  const wasEditing = useRef(selected.editing);
  useEffect(() => {
    const returning = wasEditing.current && !selected.editing;
    wasEditing.current = selected.editing;
    if (!returning) return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-change-connection]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [selected.editing]);
  const reduced = useReducedMotion();
  return <Dialog width={width} dock="left" expanded={expanded} headerless title={client?.name ?? entry.name} busy={busy}
    originKey={client?.id ?? entry.id} closeRequested={selected.closing}
    onCloseStart={() => ingressPanel.set(old => old?.ingress.id === entry.id && old.client?.id === selected.client?.id ? { ...old, closing: true } : old)}
    onClose={() => { const current = ingressPanel.get(); if (current?.ingress.id === entry.id && current.client?.id === selected.client?.id && current.closing) ingressPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(client ? client.id : entry.id)}"] button`} onPanelFrame={onPanelFrame}>
    <motion.div className="side-panel-layer" key={`${entry.id}:${selected.editing ? "edit" : "view"}`}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : selected.editing ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
      {selected.editing ? <IngressDialog embedded ingress={entry} focusField={selected.field} onBusy={setBusy}
        onClose={() => selectIngressPanel(entry)} onRemoved={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
        onSaved={ingress => { if (ingressPanel.get()?.ingress.id === entry.id) selectIngressPanel(ingress, { autoConnect: true }); }} /> : <>
        {source ? <SourcePanel key={source.id} source={source} widthControl={<IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")} aria-pressed={expanded} onClick={onToggleWidth} />} /> : <Notice>{t("accounts.unidentified")}</Notice>}
        {error && <Notice>{error}</Notice>}
        {switching && <ChangeConnection />}

      </>}
    </motion.div>
  </Dialog>;
}
