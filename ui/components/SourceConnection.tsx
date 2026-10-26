import { Freshness, EntityCard, StateBadge, SectionHeader, FactList, ActionGroup, Disclosure, FormSection, DangerZone, Button, Dialog, FormField, Input, Notice } from "./ui";
import { statePresentation } from "./objects/statePresentation";
import Address from "./Address";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { connectionSwitch } from "../state/onboarding";
import type { ControlSource } from "../state/types";
import { connectionKind, isLocalSource, isPendingSource, sourceDate } from "../sourcePresentation";
import SourceProductChoice from "./SourceProductChoice";

export default function SourceConnection({ source, onConnection }: { source: ControlSource; onConnection: (id: string) => void }) {
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
  if (isLocalSource(source)) return null;
  const others = sources.filter(s => s.id !== source.id && s.ingressId === source.ingressId && s.state !== "revoked" && !isPendingSource(s, status?.ingresses ?? []));
  const client = ingress?.oauth?.grants.find(g => g.id === source.credential.grantId)?.clientName;
  return <div className="source-detail">
    {error && !confirm && <Notice>{error}</Notice>}
    <EntityCard className="source-connection-card">
      <SectionHeader level={3} title={<><span className="muted">{t("source.connections")}</span></>} actions={<><Button data-change-connection disabled={source.state === "revoked" || busy} onClick={() => connectionSwitch.set({ sourceId: source.id, step: source.pendingSwitch ? source.pendingSwitch.requestId ? "approval" : "address" : "connection", ingressId: source.pendingSwitch?.ingressId, requestId: source.pendingSwitch?.requestId })}>{t("switch.title")}</Button></>} />
      {source.pendingSwitch && <StateBadge presentation={statePresentation("source", "pending-switch")} />}
      {ingress ? <>
      <SectionHeader level={3} title={<><Button variant="ghost" data-source-connection onClick={() => onConnection(ingress.id)}>{ingress.name}</Button></>} actions={<><span className="muted">{t(`source.kind.${connectionKind(ingress)}`)}</span></>} />
      {others.length > 0 && <p className="muted">{t("source.alsoCarries", { names: others.map(s => s.label).join(", ") })}</p>}
      {ingress.url && <Address value={ingress.url} label={t("source.copyAddress")} />}
      </> : <Notice tone="warning">{source.connectionName ? `${source.connectionName} · ` : ""}{t("source.connectionRemoved")}</Notice>}
    </EntityCard>
    <FactList missing={{ placeholder: '—' }} items={[
      { label: t("source.authorizedAt"), value: sourceDate(source.connectedAt) },
      { label: t("source.lastSeen"), value: <Freshness observedAt={source.lastSeenAt ? new Date(source.lastSeenAt * 1000).toISOString() : undefined} age={sourceDate(source.lastSeenAt)} /> },
      { label: t("source.clientName"), value: client },
      { label: t("accounts.tools"), value: 'guide · query · act' },
    ]} />
    <Disclosure title={t("accounts.advanced")}><FormSection>
      <form onSubmit={e => { e.preventDefault(); void update({ label: label.trim() }); }}>
      <FormField id="source-label" label={t("source.label")} error={labelError}>
        <Input id="source-label" value={label} disabled={busy}
          onChange={e => { setLabel(e.target.value); setLabelError(""); }} onBlur={() => void update({ label: label.trim() })} />
      </FormField>
    </form>
    <FormField label={t("source.product")}><SourceProductChoice value={source.product} disabled={busy} onChange={product => void update({ product })} /></FormField>
    </FormSection></Disclosure>
    <DangerZone consequence={t("source.disconnectConsequence")}><Button variant="danger-outline" disabled={busy || source.state === "revoked"} onClick={() => setConfirm(true)}>{t("source.disconnect")}</Button></DangerZone>
    {confirm && <Dialog title={t("source.disconnectTitle", { name: source.label })} onClose={() => setConfirm(false)} busy={busy}
      footer={<ActionGroup><Button disabled={busy} onClick={() => setConfirm(false)}>{t("cancel")}</Button><Button variant="danger" busy={busy} onClick={() => void disconnect()}>{t("disconnect")}</Button></ActionGroup>}>
      <p>{t("source.disconnectHint")}</p>{error && <Notice>{error}</Notice>}
    </Dialog>}
  </div>;
}
