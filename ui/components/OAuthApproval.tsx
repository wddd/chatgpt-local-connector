import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { onboarding, sourceForClient } from "../state/onboarding";
import type { Ingress, OAuthRequest } from "../state/types";
import { Button, Dialog, Notice } from "./ui";

export function ApprovalCard({ request, ingress, inline = false }: { request: OAuthRequest; ingress: Ingress; inline?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function decide(allow: boolean) {
    setBusy(true); setError("");
    try { await api(`ingress/${ingress.id}/oauth/decision`, "POST", { id: request.id, allow }); await refreshConnector(); }
    catch { setError(t("connect.approvalFailed")); }
    finally { setBusy(false); }
  }
  return <section className="pairing-card" aria-live="polite">
    {request.status === "pending" ? <>
      {inline && <h3>{t("connect.approveTitle")}</h3>}<p className="muted">{t("connect.compareCode")}</p>
      <strong className="pairing-code">{request.pairingCode ?? "—"}</strong>
      <p>{t("connect.client", { name: request.clientName })}</p>
      <p>{t("connect.scope", { scope: ingress.toolPolicy === "all" ? t("connect.allPermissions") : t("connect.selectedPermissions") })}</p>
      <div className="actions"><Button disabled={busy} onClick={() => void decide(false)}>{t("oauthDeny")}</Button><Button variant="primary" busy={busy} onClick={() => void decide(true)}>{t("oauthAllow")}</Button></div>
    </> : <p>{t(request.status === "approved" ? "connect.returning" : request.status === "denied" ? "oauthDenied" : "oauthFinished")}</p>}
    <details><summary>{t("connect.details")}</summary><p className="muted small">{request.resource}</p><p className="muted small">{request.redirectUri}</p></details>
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
  const selected = requested ? requests.find(p => p.request.id === requested.id) : requests.find(p => p.request.id === selectedId)
    ?? requests.find(p => p.request.status === "pending" && !dismissed.current.has(p.request.id) && p.request.id !== flow?.requestId && !(flow?.step === "connect" && p.ingress.id === flow.ingressId && !flow.baseline?.includes(p.request.id) && (flow.source === "custom" || sourceForClient(p.request.clientName) === flow.source)));
  useEffect(() => { if (selected) setSelectedId(selected.request.id); }, [selected?.request.id]);
  if (selected?.request.id === flow?.requestId) return null;
  if (!selected && !requested) return null;
  function close() { if (selected) dismissed.current.add(selected.request.id); setSelectedId(undefined); onClose(); }
  return <Dialog title={t("connect.approveTitle")} width={440} onClose={close}>
    {selected ? <ApprovalCard key={selected.request.id} {...selected} /> : <p>{t("oauthFinished")}</p>}
  </Dialog>;
}
