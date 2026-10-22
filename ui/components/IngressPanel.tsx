import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { connector, ingressState, refreshConnector } from "../state/connector";
import { ingressPanel, selectIngressPanel } from "../state/overviewPanels";
import { navigation } from "../state/navigation";
import type { SurfaceRect } from "../motion/surface";
import SourceIcon from "./SourceIcon";
import IngressConnection from "./IngressConnection";
import IngressDialog from "./IngressDialog";
import SourceDispatches from "./SourceDispatches";
import { Button, Dialog, IconButton, Notice, Switch } from "./ui";

export default function IngressPanel({ onPanelFrame }: { onPanelFrame: (rect: SurfaceRect | null) => void }) {
  const selected = ingressPanel.use()!, { status } = connector.use();
  const entry = status?.ingresses.find(i => i.id === selected.ingress.id) ?? selected.ingress;
  const [busy, setBusy] = useState(false), [toggling, setToggling] = useState(false), [error, setError] = useState("");
  const currentId = useRef(entry.id); currentId.current = entry.id;
  useEffect(() => { setError(""); setToggling(false); }, [entry.id]);
  const wasEditing = useRef(selected.editing);
  useEffect(() => {
    const returning = wasEditing.current && !selected.editing;
    wasEditing.current = selected.editing;
    if (!returning) return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-ingress-edit]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [selected.editing]);
  const reduced = useReducedMotion();
  const close = () => ingressPanel.set(old => old && { ...old, closing: true });
  async function toggle(enabled: boolean) {
    setToggling(true); setError("");
    try { await api(`ingress/${entry.id}`, "PUT", { enabled }); await refreshConnector(); }
    catch (e) { if (currentId.current === entry.id) setError(String(e)); }
    finally { if (currentId.current === entry.id) setToggling(false); }
  }
  return <Dialog width={400} dock="left" headerless title={entry.name} busy={busy || toggling}
    originKey={entry.id} closeRequested={selected.closing} onClose={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(entry.id)}"] button`} onPanelFrame={onPanelFrame}>
    <motion.div className="side-panel-layer" key={`${entry.id}:${selected.editing ? "edit" : "view"}`}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : selected.editing ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
      {selected.editing ? <IngressDialog embedded ingress={entry} focusField={selected.field} onBusy={setBusy}
        onClose={() => selectIngressPanel(entry)} onRemoved={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
        onSaved={ingress => { if (ingressPanel.get()?.ingress.id === entry.id) selectIngressPanel(ingress, { autoConnect: true }); }} /> : <>
        <header className="dialog-header">
          <SourceIcon platform={entry.controlSource} /><h2 className="activity-panel-title">{entry.name}</h2>
          <div className="actions"><Switch label={t("sourcePanel.enabled")} checked={entry.enabled} disabled={busy || toggling} onChange={value => void toggle(value)} />
            <IconButton icon={X} label={t("close")} disabled={busy || toggling} onClick={close} /></div>
          <div className="activity-panel-subline"><span className="activity-panel-meta">{t(ingressState(entry))}{entry.controlSource === "claude" ? " · Loop" : entry.controlSource === "chatgpt" ? " · Chat" : ""}</span></div>
        </header>
        <div className="side-panel-scroll">
          {error && <Notice>{error}</Notice>}
          <section className="source-connection-card"><IngressConnection key={entry.id} ingress={selected.ingress} autoConnect={selected.autoConnect} onBusy={setBusy} /></section>
          <section><h3>{t("sourcePanel.dispatches")}</h3><SourceDispatches key={entry.id} ingressId={entry.id} limit={8} />
            <Button variant="ghost" onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: "logs", recordsSource: entry.id })); }}>{t("sourcePanel.allRecords")}</Button></section>
        </div>
        <footer className="dialog-footer"><Button data-ingress-edit disabled={busy || toggling} onClick={() => selectIngressPanel(entry, { editing: true })}>{t("sourcePanel.edit")}</Button></footer>
      </>}
    </motion.div>
  </Dialog>;
}
