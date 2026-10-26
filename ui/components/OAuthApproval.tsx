import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { connector } from '../state/connector';
import { onboarding, connectionSetup, connectionSwitch } from '../state/onboarding';
import { navigation } from '../state/navigation';
import { Dialog } from './ui';
import { ApprovalCard } from './objects/authorization-request/adapter';
export { ApprovalCard } from './objects/authorization-request/adapter';
export default function OAuthApproval({ requested, onClose, inlineEnabled }: { requested?: { id: string }; onClose: () => void; inlineEnabled: boolean }) {
  const { status } = connector.use(), savedFlow = onboarding.use(), switching = connectionSwitch.use();
  const flow = inlineEnabled ? savedFlow : undefined;
  const dismissed = useRef(new Set<string>());
  const [selectedId, setSelectedId] = useState<string>();
  const requests = status?.ingresses.flatMap(ingress => (ingress.oauth?.pending ?? []).map(request => ({ ingress, request }))) ?? [];
  useEffect(() => {
    if (!requested) return;
    const target = requests.find(p => p.request.id === requested.id);
    if (!target) return;
    dismissed.current.delete(requested.id);
    connectionSetup.set(undefined);
    if (target.request.switchSourceId) {
      onboarding.set(undefined);
      navigation.set(old => ({ ...old, page: "remote", remoteSourceId: target.request.switchSourceId, remoteConnectionId: undefined }));
      connectionSwitch.set({ sourceId: target.request.switchSourceId, ingressId: target.ingress.id, requestId: target.request.id, step: "approval" });
      onClose(); return;
    }
    navigation.set(old => ({ ...old, page: "overview" }));
    onboarding.set(old => ({ ...(old?.ingressId === target.ingress.id ? old : {}), step: "approval", ingressId: target.ingress.id,
      source: target.request.product ?? target.ingress.controlSource, requestId: requested.id }));
    onClose();
  }, [requested, status]);
  const inFlow = (id: string) => requests.some(p => p.request.id === id && p.request.switchSourceId === switching?.sourceId && !!switching) || requests.some(p => p.request.id === id && p.ingress.id === flow?.ingressId && ["address", "approval"].includes(flow.step));
  const reviewable = requests.filter(p => p.request.status === "pending" && !inFlow(p.request.id));
  const selected = requested ? requests.find(p => p.request.id === requested.id) : requests.find(p => p.request.id === selectedId && p.request.status === "pending" && !inFlow(p.request.id))
    ?? requests.find(p => p.request.status === "pending" && !dismissed.current.has(p.request.id) && !inFlow(p.request.id));
  useEffect(() => { if (selected) setSelectedId(selected.request.id); }, [selected?.request.id]);
  if (selected && inFlow(selected.request.id)) return null;
  if (!selected && !requested) return null;
  function close() { if (selected) dismissed.current.add(selected.request.id); setSelectedId(undefined); onClose(); }
  return <Dialog title={t("connect.approveTitle")} width={440} onClose={close}>
    {selected ? <ApprovalCard key={selected.request.id} {...selected} pager={{ index: reviewable.findIndex(p => p.request.id === selected.request.id), count: reviewable.length, onChange: index => setSelectedId(reviewable[index].request.id) }} /> : <p>{t("oauthFinished")}</p>}
  </Dialog>;
}
