import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { onboarding } from "../state/onboarding";
import { sourceCandidates } from "../sourcePresentation";
import type { Ingress, OAuthRequest } from "../state/types";
import { Button, Dialog, Field, Input, Notice, SingleChoice } from "./ui";

export function ApprovalCard({ request, ingress, inline = false, product, onDecided }: { request: OAuthRequest; ingress: Ingress; inline?: boolean; product?: string; onDecided?: (allow: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [sourceId, setSourceId] = useState("new"), [label, setLabel] = useState(""), [labelError, setLabelError] = useState("");
  const { status, sources } = connector.use();
  const candidates = sourceCandidates(sources, status?.ingresses ?? [], ingress.id, product ?? request.product ?? "custom", request.sourceId);
  async function decide(allow: boolean) {
    if (allow && sourceId === "new" && new TextEncoder().encode(label.trim()).length > 120) {
      setLabelError(t("sourceNameTooLong")); document.getElementById(`approval-label-${request.id}`)?.focus(); return;
    }
    setBusy(true); setError("");
    try {
      if (allow && request.sourceId) {
        if (product || sourceId === "new" && label.trim()) await api(`source/${request.sourceId}`, "PUT", { ...(product ? { product } : {}), ...(sourceId === "new" && label.trim() ? { label: label.trim() } : {}) });
        await api(`source/${request.sourceId}/claim`, "POST", { sourceId });
      } else await api(`ingress/${ingress.id}/oauth/decision`, "POST", { id: request.id, allow, sourceId });
      await refreshConnector(); onDecided?.(allow);
    } catch (e) { setError(`${t("connect.approvalFailed")} ${String(e)}`); }
    finally { setBusy(false); }
  }
  return <section className="pairing-card" aria-live="polite">
    {request.status === "pending" ? <>
      {inline && <h3>{t("connect.approveTitle")}</h3>}<p className="muted">{t("connect.compareCode")}</p>
      <strong className="pairing-code">{request.pairingCode ?? "—"}</strong>
      <p>{t("connect.client", { name: request.clientName })}</p>
      <p className="source-callback">{t("source.callback")}: {request.redirectUri}</p>
      <p>{t("connect.scope", { scope: ingress.toolPolicy === "all" ? t("connect.allPermissions") : t("connect.selectedPermissions") })}</p>
      {candidates.length > 0 && <SingleChoice cards label={t("source.authorization")} value={sourceId} onChange={setSourceId} disabled={busy} options={[{ value: "new", label: t("source.new") }, ...candidates.map(s => ({ value: s.id, label: t("source.reauthorize", { name: s.label }) }))]} />}
      {sourceId === "new" && <Field id={`approval-label-${request.id}`} label={t("source.optionalLabel")} error={labelError}>
        <Input id={`approval-label-${request.id}`} value={label} disabled={busy} aria-invalid={!!labelError} aria-describedby={labelError ? `approval-label-${request.id}-error` : undefined} onChange={e => { setLabel(e.target.value); setLabelError(""); }} />
      </Field>}
      <div className="actions"><Button disabled={busy} onClick={() => void decide(false)}>{t("oauthDeny")}</Button><Button variant="primary" busy={busy} disabled={sourceId !== "new" && !candidates.some(s => s.id === sourceId)} onClick={() => void decide(true)}>{t("oauthAllow")}</Button></div>
    </> : <p>{t(request.status === "approved" ? "connect.returning" : request.status === "denied" ? "oauthDenied" : "oauthFinished")}</p>}
    {error && <Notice tone="danger">{error}</Notice>}
  </section>;
}
export default function OAuthApproval({ requested, onClose, inlineEnabled }: { requested?: { id: string }; onClose: () => void; inlineEnabled: boolean }) {
  const { status } = connector.use(), savedFlow = onboarding.use();
  const flow = inlineEnabled ? savedFlow : undefined;
  const dismissed = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string>();
  const requests = status?.ingresses.flatMap(ingress => (ingress.oauth?.pending ?? []).map(request => ({ ingress, request }))) ?? [];
  useEffect(() => {
    if (requested) { dismissed.current.delete(requested.id); setSelectedId(requested.id); }
  }, [requested]);
  const inFlow = (id: string) => requests.some(p => p.request.id === id && p.ingress.id === flow?.ingressId && ["address", "approval"].includes(flow.step));
  const selected = requested ? requests.find(p => p.request.id === requested.id) : requests.find(p => p.request.id === selectedId)
    ?? requests.find(p => p.request.status === "pending" && !dismissed.current.has(p.request.id) && !inFlow(p.request.id));
  useEffect(() => { if (selected) setSelectedId(selected.request.id); }, [selected?.request.id]);
  if (selected && inFlow(selected.request.id)) return null;
  if (!selected && !requested) return null;
  function close() { if (selected) dismissed.current.add(selected.request.id); setSelectedId(undefined); onClose(); }
  return <Dialog title={t("connect.approveTitle")} width={440} onClose={close}>
    {selected ? <ApprovalCard key={selected.request.id} {...selected} /> : <p>{t("oauthFinished")}</p>}
  </Dialog>;
}
