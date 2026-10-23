import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Maximize2, Minimize2, Settings } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { connector, refreshConnector } from "../state/connector";
import { ingressPanel, selectIngressPanel } from "../state/overviewPanels";
import { navigation } from "../state/navigation";
import type { SurfaceRect } from "../motion/surface";
import SourceIcon from "./SourceIcon";
import IngressDialog from "./IngressDialog";
import SourceDispatches from "./SourceDispatches";
import { Dialog, IconButton, Notice, Switch } from "./ui";

export default function IngressPanel({ onPanelFrame, width, expanded, onToggleWidth }: {
  onPanelFrame: (rect: SurfaceRect | null) => void; width?: number; expanded: boolean; onToggleWidth: () => void;
}) {
  const selected = ingressPanel.use()!, { status, sources } = connector.use();
  const entry = status?.ingresses.find(i => i.id === selected.ingress.id) ?? selected.ingress;
  const source = sources.find(s => s.id === selected.client?.id);
  const client = source ? { id: source.id, name: source.label, source: source.product } : selected.client;
  const [busy, setBusy] = useState(false), [toggling, setToggling] = useState(false), [error, setError] = useState("");
  const currentId = useRef(entry.id); currentId.current = entry.id;
  useEffect(() => { setError(""); setToggling(false); }, [entry.id]);
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
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-ingress-edit]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [selected.editing]);
  const reduced = useReducedMotion();
  async function toggle(enabled: boolean) {
    setToggling(true); setError("");
    try { await api(`ingress/${entry.id}`, "PUT", { enabled }); await refreshConnector(); }
    catch (e) { if (currentId.current === entry.id) setError(String(e)); }
    finally { if (currentId.current === entry.id) setToggling(false); }
  }
  return <Dialog width={width} dock="left" expanded={expanded} headerless title={client?.name ?? entry.name} busy={busy || toggling}
    originKey={client?.id ?? entry.id} closeRequested={selected.closing} onClose={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(client ? client.id : entry.id)}"] button`} onPanelFrame={onPanelFrame}>
    <motion.div className="side-panel-layer" key={`${entry.id}:${selected.editing ? "edit" : "view"}`}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : selected.editing ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
      {selected.editing ? <IngressDialog embedded ingress={entry} focusField={selected.field} onBusy={setBusy}
        onClose={() => selectIngressPanel(entry)} onRemoved={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
        onSaved={ingress => { if (ingressPanel.get()?.ingress.id === entry.id) selectIngressPanel(ingress, { autoConnect: true }); }} /> : <>
        <header className="dialog-header">
          <SourceIcon platform={client?.source ?? entry.controlSource} />
          <div className="source-panel-heading">
            <h2 className="activity-panel-title">{client?.name ?? entry.name}</h2>
            <IconButton icon={Settings} label={t("settings")} data-ingress-edit onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: "remote", remoteSourceId: client?.id, remoteConnectionId: undefined })); }} />
          </div>
          <div className="actions">{(!client || sources.filter(s => s.ingressId === entry.id && s.state !== "revoked").length === 1) && <Switch label={t("sourcePanel.enabled")} checked={entry.enabled} disabled={busy || toggling} onChange={value => void toggle(value)} />}
            <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")}
              aria-pressed={expanded} onClick={onToggleWidth} /></div>
        </header>
        <div className="side-panel-scroll">
          {error && <Notice>{error}</Notice>}
          <section><h3>{t("sourcePanel.dispatches")}</h3><SourceDispatches key={client?.id} sourceId={client?.id ?? ""} /></section>
        </div>
      </>}
    </motion.div>
  </Dialog>;
}
