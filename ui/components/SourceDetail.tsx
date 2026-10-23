import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { locale, t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { connectionSwitch } from "../state/onboarding";
import type { ControlSource } from "../state/types";
import { connectionKind, isPendingSource } from "../sourcePresentation";
import SourceProductChoice from "./SourceProductChoice";
import SourceDispatches from "./SourceDispatches";
import { Button, CopyField, Dialog, Field, Input, Notice, Status } from "./ui";

export default function SourceDetail({ source, onConnection }: { source: ControlSource; onConnection: (id: string) => void }) {
  const { status, sources } = connector.use();
  const ingress = status?.ingresses.find(i => i.id === source.ingressId);
  const [label, setLabel] = useState(source.label), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [labelError, setLabelError] = useState(""), [confirm, setConfirm] = useState(false);
  const saving = useRef(false);
  useEffect(() => setLabel(source.label), [source.label]);
  async function update(patch: { label?: string; product?: string }) {
    if (saving.current) return;
    if (patch.label !== undefined) {
      const invalid = !patch.label ? t("fieldRequired") : new TextEncoder().encode(patch.label).length > 120 ? t("sourceNameTooLong") : "";
      setLabelError(invalid);
      if (invalid) { document.getElementById("source-label")?.focus(); return; }
      if (patch.label === source.label) return;
    }
    saving.current = true; setBusy(true); setError("");
    try { await api(`source/${source.id}`, "PUT", patch); await refreshConnector(); }
    catch (e) { setError(String(e)); }
    finally { saving.current = false; setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError("");
    try { await api(`source/${source.id}/disconnect`, "POST"); await refreshConnector(); setConfirm(false); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  const others = sources.filter(s => s.id !== source.id && s.ingressId === source.ingressId && s.state !== "revoked" && !isPendingSource(s, status?.ingresses ?? []));
  const client = ingress?.oauth?.grants.find(g => g.id === source.credential.grantId)?.clientName;
  const date = (value: number | null) => value === null ? "—" : new Date(value * 1000).toLocaleString(locale.get(), { hour12: false });
  return <div className="source-detail">
    <form onSubmit={e => { e.preventDefault(); void update({ label: label.trim() }); }}>
      <Field id="source-label" label={t("source.label")} error={labelError}>
        <Input id="source-label" value={label} disabled={busy} aria-invalid={!!labelError} aria-describedby={labelError ? "source-label-error" : undefined}
          onChange={e => { setLabel(e.target.value); setLabelError(""); }} onBlur={() => void update({ label: label.trim() })} />
      </Field>
    </form>
    <Field label={t("source.product")}><SourceProductChoice value={source.product} disabled={busy} onChange={product => void update({ product })} /></Field>
    <div className="source-section-heading">
      <Status tone={source.state === "connected" ? "success" : "neutral"}>{t(`source.state.${source.state}`)}</Status>
      <Button variant="danger" disabled={busy || source.state === "revoked"} onClick={() => setConfirm(true)}>{t("source.disconnect")}</Button>
    </div>
    {error && !confirm && <Notice>{error}</Notice>}
    <section className="source-connection-card">
      <div className="source-section-heading"><span className="muted">{t("source.connections")}</span><Button data-change-connection disabled={source.state === "revoked" || busy} onClick={() => connectionSwitch.set({ sourceId: source.id, step: source.pendingSwitch ? source.pendingSwitch.requestId ? "approval" : "address" : "connection", ingressId: source.pendingSwitch?.ingressId, requestId: source.pendingSwitch?.requestId })}>{t("switch.title")}</Button></div>
      {source.pendingSwitch && <Status tone="warning">{t("switch.pending")}</Status>}
      {ingress ? <>
      <div className="source-section-heading"><Button variant="ghost" data-source-connection onClick={() => onConnection(ingress.id)}>{ingress.name}</Button><span className="muted">{t(`source.kind.${connectionKind(ingress)}`)}</span></div>
      {others.length > 0 && <p className="muted">{t("source.alsoCarries", { names: others.map(s => s.label).join(", ") })}</p>}
      {ingress.url && <CopyField value={ingress.url} label={t("source.copyAddress")} />}
      </> : <Notice tone="warning">{source.connectionName ? `${source.connectionName} · ` : ""}{t("source.connectionRemoved")}</Notice>}
    </section>
    <dl className="source-facts">
      <div><dt>{t("source.authorizedAt")}</dt><dd>{date(source.connectedAt)}</dd></div>
      <div><dt>{t("source.lastSeen")}</dt><dd>{date(source.lastSeenAt)}</dd></div>
      <div><dt>{t("source.clientName")}</dt><dd>{client || "—"}</dd></div>
    </dl>
    <section><h3>{t("sourcePanel.dispatches")}</h3><SourceDispatches key={source.id} sourceId={source.id} /></section>
    {confirm && <Dialog title={t("source.disconnectTitle", { name: source.label })} onClose={() => setConfirm(false)} busy={busy}
      footer={<><Button disabled={busy} onClick={() => setConfirm(false)}>{t("cancel")}</Button><Button variant="danger" busy={busy} onClick={() => void disconnect()}>{t("disconnect")}</Button></>}>
      <p>{t("source.disconnectHint")}</p>{error && <Notice>{error}</Notice>}
    </Dialog>}
  </div>;
}
