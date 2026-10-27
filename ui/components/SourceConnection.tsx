import { SrcAccountCard } from "./objects/src-account";
import type { ProviderAccount } from "../types";
import { ActionGroup, FormSection, DangerZone, Button, Dialog, FormField, Input, Notice } from "./ui";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import type { ControlSource } from "../state/types";
import { isLocalSource } from "../sourcePresentation";

export default function SourceConnection({ source, account, onConnection }: { source: ControlSource; account?: ProviderAccount; onConnection: (id: string) => void }) {
  const { status } = connector.use();
  const ingress = status?.ingresses.find(i => i.id === source.ingressId);
  const [label, setLabel] = useState(source.label), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [labelError, setLabelError] = useState(""), [confirm, setConfirm] = useState(false);
  const saving = useRef(false);
  useEffect(() => setLabel(source.label), [source.label]);
  async function update(patch: { label?: string }) {
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
    <SrcAccountCard source={source} account={account} ingress={ingress} ingresses={status?.ingresses} onConnection={onConnection} />
    <FormSection>
      <form onSubmit={e => { e.preventDefault(); void update({ label: label.trim() }); }}>
      <FormField id="source-label" label={t("source.label")} error={labelError}>
        <Input id="source-label" value={label} disabled={busy}
          onChange={e => { setLabel(e.target.value); setLabelError(""); }} onBlur={() => void update({ label: label.trim() })} />
      </FormField>
    </form>
    </FormSection>
    <DangerZone consequence={t("source.disconnectConsequence")}><Button variant="danger-outline" disabled={busy || source.state === "revoked"} onClick={() => setConfirm(true)}>{t("source.disconnect")}</Button></DangerZone>
    {confirm && <Dialog title={t("source.disconnectTitle", { name: source.label })} onClose={() => setConfirm(false)} busy={busy}
      footer={<ActionGroup><Button disabled={busy} onClick={() => setConfirm(false)}>{t("cancel")}</Button><Button variant="danger" busy={busy} onClick={() => void disconnect()}>{t("disconnect")}</Button></ActionGroup>}>
      <p>{t("source.disconnectHint")}</p>{error && <Notice>{error}</Notice>}
    </Dialog>}
  </div>;
}
