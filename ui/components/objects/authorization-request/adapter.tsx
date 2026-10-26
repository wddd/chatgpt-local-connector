import { useEffect, useState } from "react";
import { api } from "../../../api";
import { remoteProfileSetting, recommendedRemoteProfile, type RemoteProfile, nextSourceName } from "../../../controlSources";
import { t } from "../../../i18n";
import { connector, refreshConnector } from "../../../state/connector";
import { sourceCandidates } from "../../../sourcePresentation";
import type { Ingress, OAuthRequest } from "../../../state/types";

import { AuthorizationRequestCard, type AuthorizationRequestCardProps } from "./Card";
export function ApprovalCard({ request, ingress, inline = false, product, onDecided, onBusy, pager }: { request: OAuthRequest; ingress: Ingress; inline?: boolean; product?: string; onDecided?: (allow: boolean) => void; onBusy?: (busy: boolean) => void; pager?: AuthorizationRequestCardProps["pager"] }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [sourceId, setSourceId] = useState(request.switchSourceId || "new"), [label, setLabel] = useState(() => nextSourceName(product ?? request.product ?? "custom", connector.get().sources.filter(s => s.id !== request.sourceId).map(s => s.label))), [labelError, setLabelError] = useState("");
  const [profile, setProfile] = useState<RemoteProfile>(() => recommendedRemoteProfile(product ?? request.product ?? "custom"));
  const { status, sources } = connector.use();
  const fixed = sources.find(s => s.id === request.switchSourceId);
  const oldConnection = status?.ingresses.find(i => i.id === fixed?.ingressId);
  const remaining = sources.filter(s => s.ingressId === fixed?.ingressId && s.id !== fixed?.id && s.state !== "revoked" && s.connectedAt !== null);
  const candidates = sourceCandidates(sources, status?.ingresses ?? [], ingress.id, product ?? request.product ?? "custom", request.sourceId);
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);
  async function decide(allow: boolean) {
    if (busy || request.status !== "pending" || allow && !request.switchSourceId && sourceId !== "new" && !candidates.some(s => s.id === sourceId)) return;
    if (allow && sourceId === "new" && new TextEncoder().encode(label.trim()).length > 120) {
      setLabelError(t("sourceNameTooLong")); document.getElementById(`approval-label-${request.id}`)?.focus(); return;
    }
    setBusy(true); setError("");
    try {
      if (allow && request.sourceId) {
        if (!request.switchSourceId && (product || sourceId === "new" && label.trim())) await api(`source/${request.sourceId}`, "PUT", { ...(product ? { product } : {}), ...(sourceId === "new" ? { label: label.trim(), capabilityProfile: remoteProfileSetting(profile) } : {}) });
        await api(`source/${request.sourceId}/claim`, "POST", { sourceId });
      } else await api(`ingress/${ingress.id}/oauth/decision`, "POST", { id: request.id, allow, sourceId });
      await refreshConnector(); onDecided?.(allow);
    } catch (e) { setError(`${t("connect.approvalFailed")} ${String(e)}`); }
    finally { setBusy(false); }
  }
  return <AuthorizationRequestCard pager={pager} request={request} ingress={ingress} inline={inline} busy={busy} error={error} labelError={labelError} sourceId={sourceId} onSourceChange={setSourceId} label={label} onLabelChange={value => { setLabel(value); setLabelError(""); }} profile={profile} onProfileChange={setProfile} candidates={candidates} fixed={fixed} oldConnection={oldConnection} remaining={remaining} onDecide={allow => void decide(allow)} />;
}
