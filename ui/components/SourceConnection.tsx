import { SrcAccountCard } from "./objects/src-account";
import type { ProviderAccount } from "../types";
import { ActionGroup, Disclosure, FormSection, DangerZone, Button, Dialog, FormField, Input, Notice, SingleChoice } from "./ui";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { connectionSwitch } from "../state/onboarding";
import type { ControlSource } from "../state/types";
import { isLocalSource } from "../sourcePresentation";
import { remoteProfiles, remoteProfileName, remoteProfileSetting, type CapabilityProfile, type RemoteProfile } from "../controlSources";
import SourceProductChoice from "./SourceProductChoice";

export default function SourceConnection({ source, account, onConnection }: { source: ControlSource; account?: ProviderAccount; onConnection: (id: string) => void }) {
  const { status } = connector.use();
  const ingress = status?.ingresses.find(i => i.id === source.ingressId);
  const [label, setLabel] = useState(source.label), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [labelError, setLabelError] = useState(""), [confirm, setConfirm] = useState(false);
  const saving = useRef(false);
  useEffect(() => setLabel(source.label), [source.label]);
  async function update(patch: { label?: string; product?: string; capabilityProfile?: CapabilityProfile | null }) {
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
  return <div className="grid min-w-0 gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
    {error && !confirm && <Notice>{error}</Notice>}
    <SrcAccountCard source={source} account={account} ingress={ingress} ingresses={status?.ingresses} onAuthorization={(ingressId, requestId) => connectionSwitch.set({ sourceId: source.id, step: 'approval', ingressId, requestId })} onConnection={onConnection}
      headerActions={<Button data-change-connection disabled={source.state === "revoked" || busy} onClick={() => connectionSwitch.set({ sourceId: source.id, step: source.pendingSwitch ? source.pendingSwitch.requestId ? "approval" : "address" : "connection", ingressId: source.pendingSwitch?.ingressId, requestId: source.pendingSwitch?.requestId })}>{t("switch.title")}</Button>} />
    <Disclosure title={t("accounts.advanced")}><FormSection>
      <form onSubmit={e => { e.preventDefault(); void update({ label: label.trim() }); }}>
      <FormField id="source-label" label={t("source.label")} error={labelError}>
        <Input id="source-label" value={label} disabled={busy}
          onChange={e => { setLabel(e.target.value); setLabelError(""); }} onBlur={() => void update({ label: label.trim() })} />
      </FormField>
    </form>
    <FormField label={t("source.product")}><SourceProductChoice value={source.product} disabled={busy} onChange={product => void update({ product })} /></FormField>
    <FormField label={t("source.profile")}><SingleChoice label={t("source.profile")} value={remoteProfileName(source.capabilityProfile)} disabled={busy} onChange={value => void update({ capabilityProfile: remoteProfileSetting(value as RemoteProfile) })} options={remoteProfiles.map(value => ({ value, label: t(`source.profile.${value}`) }))} /></FormField>
    </FormSection></Disclosure>
    <DangerZone consequence={t("source.disconnectConsequence")}><Button variant="danger-outline" disabled={busy || source.state === "revoked"} onClick={() => setConfirm(true)}>{t("source.disconnect")}</Button></DangerZone>
    {confirm && <Dialog title={t("source.disconnectTitle", { name: source.label })} onClose={() => setConfirm(false)} busy={busy}
      footer={<ActionGroup><Button disabled={busy} onClick={() => setConfirm(false)}>{t("cancel")}</Button><Button variant="danger" busy={busy} onClick={() => void disconnect()}>{t("disconnect")}</Button></ActionGroup>}>
      <p>{t("source.disconnectHint")}</p>{error && <Notice>{error}</Notice>}
    </Dialog>}
  </div>;
}
