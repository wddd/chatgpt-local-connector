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
import IngressDialog from "./IngressDialog";
import SourceDispatches from "./SourceDispatches";
import { Button, CopyField, Dialog, IconButton, Notice, Switch } from "./ui";

export default function IngressPanel({ onPanelFrame }: { onPanelFrame: (rect: SurfaceRect | null) => void }) {
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
  const close = () => ingressPanel.set(old => old && { ...old, closing: true });
  async function toggle(enabled: boolean) {
    setToggling(true); setError("");
    try { await api(`ingress/${entry.id}`, "PUT", { enabled }); await refreshConnector(); }
    catch (e) { if (currentId.current === entry.id) setError(String(e)); }
    finally { if (currentId.current === entry.id) setToggling(false); }
  }
  return <Dialog width={400} dock="left" headerless title={selected.client?.name ?? entry.name} busy={busy || toggling}
    originKey={entry.id} closeRequested={selected.closing} onClose={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(selected.client ? `${entry.id}:${selected.client.id}` : entry.id)}"] button`} onPanelFrame={onPanelFrame}>
    <motion.div className="side-panel-layer" key={`${entry.id}:${selected.editing ? "edit" : "view"}`}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : selected.editing ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
      {selected.editing ? <IngressDialog embedded ingress={entry} focusField={selected.field} onBusy={setBusy}
        onClose={() => selectIngressPanel(entry)} onRemoved={() => { if (ingressPanel.get()?.ingress.id === entry.id) ingressPanel.set(undefined); }}
        onSaved={ingress => { if (ingressPanel.get()?.ingress.id === entry.id) selectIngressPanel(ingress, { autoConnect: true }); }} /> : <>
        <header className="dialog-header">
          <SourceIcon platform={selected.client?.source ?? entry.controlSource} /><h2 className="activity-panel-title">{selected.client?.name ?? entry.name}</h2>
          <div className="actions">{!selected.client && <Switch label={t("sourcePanel.enabled")} checked={entry.enabled} disabled={busy || toggling} onChange={value => void toggle(value)} />}
            <IconButton icon={X} label={t("close")} disabled={busy || toggling} onClick={close} /></div>
          <div className="activity-panel-subline"><span className="activity-panel-meta">{t(ingressState(entry))}{entry.controlSource === "claude" ? " · Loop" : entry.controlSource === "chatgpt" ? " · Chat" : ""}</span></div>
        </header>
        <div className="side-panel-scroll">
          {error && <Notice>{error}</Notice>}
          <section className="source-connection-card">
            <p>{t(entry.state === "ready" ? "connect.online" : "connect.offline")}</p>
            {entry.url && <CopyField value={entry.url} label={t("connect.remoteLink")} />}
            <CopyField value={t("connect.tryPrompt")} label={t("connect.tryClaude")} />
            {selected.client && <Button disabled={busy} onClick={() => { setBusy(true); void api(`ingress/${entry.id}/oauth/revoke`, "POST", { id: selected.client!.id }).then(refreshConnector).then(() => ingressPanel.set(undefined)).catch(() => setError(t("connect.actionFailed"))).finally(() => setBusy(false)); }}>{t("oauthRevoke")}</Button>}
          </section>
          <section><h3>{t("sourcePanel.dispatches")}</h3><SourceDispatches key={entry.id} ingressId={entry.id} limit={8} />
            <Button variant="ghost" onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: "logs", recordsSource: entry.id })); }}>{t("sourcePanel.allRecords")}</Button></section>
        </div>
        <footer className="dialog-footer"><Button data-ingress-edit onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: "settings" })); }}>{t("connect.manage")}</Button></footer>
      </>}
    </motion.div>
  </Dialog>;
}
