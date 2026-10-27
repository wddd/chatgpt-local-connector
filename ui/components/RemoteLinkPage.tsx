import { SrcAccountRow } from "./objects/src-account";
import { TunnelCard, TunnelRow } from "./objects/tunnel";
import { DangerZone, SectionHeader, Button, Dialog, Empty, HoverScope, Icon, Notice, SingleChoice, Switch } from "./ui";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { preference } from "../state/store";
import { navigation } from "../state/navigation";
import { onboarding, openOnboarding, openConnectionSetup, connectionSwitch, connectionSetup } from "../state/onboarding";
import { useRelays } from "../state/relay";
import { isLocalSource, isPendingSource, sourceCandidates } from "../sourcePresentation";
import type { Ingress } from "../state/types";
import IngressDialog from "./IngressDialog";
import ChangeConnection from "./ChangeConnection";
import AddConnection from "./AddConnection";
import Onboarding from "./Onboarding";
import SourcePanel from "./SourcePanel";
import { ApprovalCard } from "./OAuthApproval";
import { RelaySettings } from "./RelaySettings";

const grouping = preference<"all" | "platform">("arc.source-grouping", "all");
export default function RemoteLinkPage() {
  const { status, sources, error: readError } = connector.use(), nav = navigation.use(), relays = useRelays();
  const group = grouping.use(), switching = connectionSwitch.use(), newConnection = connectionSetup.use(), flow = onboarding.use();
  const [editing, setEditing] = useState<Ingress>(), [error, setError] = useState("");
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [removing, setRemoving] = useState(false), [removeBusy, setRemoveBusy] = useState(false);
  const [claim, setClaim] = useState<string>();
  const previous = useRef<string | undefined>(undefined);
  const entries = (status?.ingresses ?? []).filter(entry => entry.id !== "local-cli" || entry.transport !== "local");
  const visible = sources.filter(s => !isLocalSource(s) && s.state !== "revoked" && !isPendingSource(s, entries));
  const selected = sources.find(s => !isLocalSource(s) && s.id === nav.remoteSourceId);
  const connection = entries.find(i => i.id === nav.remoteConnectionId);
  const selectedRelay = relays.relays.find(r => r.ingressId === connection?.id);
  const affected = visible.filter(s => s.ingressId === connection?.id);
  const joined = selectedRelay && !selectedRelay.owner;
  const requests = entries.flatMap(ingress => (ingress.oauth?.pending ?? []).filter(request => request.status === "pending").map(request => ({ ingress, request })));
  const claiming = requests.find(p => p.request.id === claim);
  useEffect(() => {
    const current = nav.remoteConnectionId ?? nav.remoteSourceId;
    const prior = previous.current;
    const frame = requestAnimationFrame(() => {
      const target = !current && prior ? document.querySelector<HTMLElement>(`[data-remote-row="${CSS.escape(prior)}"]`)
        : prior && nav.remoteSourceId && !nav.remoteConnectionId ? document.querySelector<HTMLElement>(`[data-object-reference="${CSS.escape(prior)}"]`)
        : current && !nav.remoteSourceId ? document.querySelector<HTMLElement>(".sheet-header h1") : null;
      target?.focus({ preventScroll: true });
    });
    previous.current = current;
    return () => cancelAnimationFrame(frame);
  }, [nav.remoteSourceId, nav.remoteConnectionId]);
  function add(connectionOnly = false) {
    if (connectionOnly) openConnectionSetup();
    else openOnboarding();
  }
  async function removeConnection() {
    if (!connection) return;
    setRemoveBusy(true); setError("");
    try {
      if (joined) await api("relay/leave", "POST", { id: selectedRelay.id });
      else await api(`ingress/${connection.id}`, "DELETE");
      await refreshConnector(); await relays.refresh(); setRemoving(false);
      navigation.set(old => ({ ...old, remoteConnectionId: undefined }));
    } catch (e) { setError(String(e)); } finally { setRemoveBusy(false); }
  }
  const groups = group === "platform" ? [...new Set(visible.map(s => s.platform))].sort() : [""];
  return <div className="grid min-w-0 gap-6">
    {readError && <Notice>{readError}</Notice>}
    {connection ? <div className="grid min-w-0 gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
      <TunnelCard ingress={connection} relay={selectedRelay} sources={affected} busy={connectionBusy}
        headerActions={<Switch label={t('sourcePanel.enabled')} checked={connection.enabled} disabled={connectionBusy} onChange={enabled => {
          setConnectionBusy(true); setError('');
          void api(`ingress/${connection.id}`, 'PUT', { enabled }).then(refreshConnector).catch(e => setError(String(e))).finally(() => setConnectionBusy(false));
        }} />}>
        <SectionHeader level={3} title={t("setup.sourcesUsing", { count: affected.length })} actions={<Button data-add-source onClick={() => openOnboarding("product", { ingressId: connection.id, fixedConnection: true })}>{t("setup.addSourceForConnection")}</Button>} />
        <HoverScope>{affected.map(source => <SrcAccountRow key={source.id} source={source} onOpen={() => navigation.set(old => ({ ...old, remoteSourceId: source.id, remoteConnectionId: undefined }))} />)}</HoverScope>
        {!affected.length && <p className="text-muted-foreground">{t("source.unused")}</p>}
      </TunnelCard>
      {selectedRelay && <RelaySettings relay={selectedRelay} version={relays.version} refresh={relays.refresh} />}
      {!["local", "relay"].includes(connection.transport) && <Button onClick={() => setEditing(connection)}>{t("edit")}</Button>}
      {selectedRelay?.owner && <Button className="justify-self-start" variant="ghost" onClick={() => navigation.set(old => ({ ...old, page: "settings", settingsExtras: true }))}>{t("setup.hostingLink")}<Icon icon={ChevronRight} /></Button>}
      <DangerZone consequence={t("setup.removeAffected", { names: affected.map(s => s.label).join(", ") || t("source.unused") })}><Button variant="danger-outline" onClick={() => { setError(""); setRemoving(true); }}>{t(joined ? "connect.leave" : "remove")}</Button></DangerZone>
    </div> : <>
      <SectionHeader level={3} titleAsChild title={<><SingleChoice compact label={t("source.grouping")} value={group} onChange={value => grouping.set(value as "all" | "platform")} options={[{ value: "all", label: t("all") }, { value: "platform", label: t("source.byPlatform") }]} /></>} actions={<><Button data-add-source variant="primary" onClick={() => add()}>{t("addControlSource")}</Button></>} />
      {requests.filter(({ ingress, request }) => request.switchSourceId || sourceCandidates(sources, entries, ingress.id, request.product ?? "custom", request.sourceId).length > 0).map(({ ingress, request }) => <Notice key={request.id} tone="warning" action={<Button onClick={() => setClaim(request.id)}>{t("source.review")}</Button>}>{t("source.pendingReauthorization", { name: request.clientName, connection: ingress.name })}</Notice>)}
      <HoverScope>{groups.map(platform => <section key={platform} className="grid min-w-0 gap-2">
        {platform && <h3>{t(`source.platform.${platform}`) === `source.platform.${platform}` ? platform : t(`source.platform.${platform}`)}</h3>}
        {visible.filter(s => !platform || s.platform === platform).map(source => {
          const ingress = entries.find(i => i.id === source.ingressId);
          return <SrcAccountRow key={source.id} source={source} ingress={ingress}
            onOpen={() => navigation.set(old => ({ ...old, remoteSourceId: source.id }))}
            onConnection={id => navigation.set(old => ({ ...old, remoteConnectionId: id, remoteSourceId: undefined }))} />;
        })}
      </section>)}</HoverScope>
      {!visible.length && <Empty>{t("source.empty")}</Empty>}
      <section className="grid min-w-0 gap-2"><SectionHeader level={3} title={<>{t("source.connections")}</>} actions={<><Button data-new-connection onClick={() => add(true)}>{t("source.newConnection")}</Button></>} />
        <HoverScope>{entries.map(ingress => {
          return <TunnelRow key={ingress.id} ingress={ingress} sources={visible} onOpen={() => navigation.set(old => ({ ...old, remoteConnectionId: ingress.id }))} />;
        })}</HoverScope>
      </section>
    </>}
    {selected && <Dialog dock="left" width={520} headerless title={selected.label} returnFocus={`[data-remote-row="${CSS.escape(selected.id)}"]`} onClose={() => navigation.set(old => old.remoteSourceId === selected.id ? { ...old, remoteSourceId: undefined } : old)}><div className="side-panel-layer"><SourcePanel key={selected.id} source={selected} /></div></Dialog>}
    {(error || relays.error) && <Notice>{error || t("connect.readFailed")}</Notice>}
    {removing && connection && <Dialog centered title={t(joined ? "connect.confirm.leave" : "setup.removeConnection")} width={440} busy={removeBusy} onClose={() => setRemoving(false)} footer={<><Button disabled={removeBusy} onClick={() => setRemoving(false)}>{t("cancel")}</Button><Button variant="danger" busy={removeBusy} onClick={() => void removeConnection()}>{t(joined ? "connect.leave" : "remove")}</Button></>}>
      <p>{t("setup.removeConfirm", { name: connection.name, names: affected.map(s => s.label).join(", ") || t("source.unused") })}</p>{error && <Notice>{error}</Notice>}
    </Dialog>}
    {switching && <ChangeConnection />}
    {flow && <Onboarding returnFocus="[data-add-source], .hub-source" />}
    {newConnection && <AddConnection options={newConnection} returnFocus="[data-new-connection], [data-add-source], .hub-source" onClose={() => connectionSetup.set(undefined)} onAdded={id => {
      if (newConnection.forSwitch) connectionSwitch.set(old => old && { ...old, ingressId: id });
      if (newConnection.forSource) onboarding.set(old => old?.step === "connection" ? { ...old, step: "address", ingressId: id, baseline: (connector.get().status?.ingresses.find(i => i.id === id)?.oauth?.pending ?? []).map(p => p.id) } : old);
      connectionSetup.set(undefined);
    }} />}
    {claiming && <Dialog title={t("source.authorization")} onClose={() => setClaim(undefined)}><ApprovalCard key={claiming.request.id} {...claiming} onDecided={() => setClaim(undefined)} /></Dialog>}
    {editing && <IngressDialog ingress={editing} onClose={() => setEditing(undefined)} onRemoved={() => { setEditing(undefined); navigation.set(old => ({ ...old, remoteConnectionId: undefined })); }} onSaved={entry => {
      setEditing(undefined); void api(`ingress/${entry.id}/start`, "POST").then(refreshConnector).catch(e => setError(String(e)));
    }} />}
  </div>;
}
