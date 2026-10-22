import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { connector, refreshConnector } from "../state/connector";
import { ingressPanel, selectIngressPanel } from "../state/overviewPanels";
import { navigation } from "../state/navigation";
import type { SurfaceRect } from "../motion/surface";
import SourceIcon from "./SourceIcon";
import IngressDialog from "./IngressDialog";
import SourceDispatches from "./SourceDispatches";
import { Button, Dialog, IconButton, Notice, Switch } from "./ui";

export default function IngressPanel({ onPanelFrame, expanded, onToggleWidth }: {
  onPanelFrame: (rect: SurfaceRect | null) => void; expanded: boolean; onToggleWidth: () => void;
}) {
  const selected = ingressPanel.use()!, { status } = connector.use();
  const entry = status?.ingresses.find(i => i.id === selected.ingress.id) ?? selected.ingress;
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
  return <Dialog width={400} dock="left" expanded={expanded} headerless title={selected.client?.name ?? entry.name} busy={busy || toggling}
    originKey={entry.id} closeRequested={selected.closing} onClose={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(selected.client ? selected.client.id : entry.id)}"] button`} onPanelFrame={onPanelFrame}>
    <motion.div className="side-panel-layer" key={`${entry.id}:${selected.editing ? "edit" : "view"}`}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : selected.editing ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
      {selected.editing ? <IngressDialog embedded ingress={entry} focusField={selected.field} onBusy={setBusy}
        onClose={() => selectIngressPanel(entry)} onRemoved={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
        onSaved={ingress => { if (ingressPanel.get()?.ingress.id === entry.id) selectIngressPanel(ingress, { autoConnect: true }); }} /> : <>
        <header className="dialog-header">
          <SourceIcon platform={selected.client?.source ?? entry.controlSource} /><h2 className="activity-panel-title">{selected.client?.name ?? entry.name}</h2>
          <div className="actions">{(!selected.client || entry.sources?.length === 1) && <Switch label={t("sourcePanel.enabled")} checked={entry.enabled} disabled={busy || toggling} onChange={value => void toggle(value)} />}
            <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")}
              aria-pressed={expanded} onClick={onToggleWidth} /></div>
        </header>
        <div className="side-panel-scroll">
          {error && <Notice>{error}</Notice>}
          <section><h3>{t("sourcePanel.dispatches")}</h3><SourceDispatches key={selected.client?.id} sourceId={selected.client?.id ?? ""} /></section>
        </div>
        <footer className="dialog-footer"><Button data-ingress-edit onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: "remote" })); }}>{t("connect.manage")}</Button></footer>
      </>}
    </motion.div>
  </Dialog>;
}
