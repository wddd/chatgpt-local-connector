import { FactList, EntityCard, EntityRow, StateBadge, SectionHeader, PlatformIcon, Button, Dialog, Empty, HoverScope, Icon, Notice, SingleChoice, Tag } from "./ui";
import { ingressState } from "../state/connector";
import { statePresentation } from "./objects/statePresentation";
import Address from "./Address";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { preference } from "../state/store";
import { navigation } from "../state/navigation";
import { onboarding, openOnboarding, openConnectionSetup, connectionSwitch, connectionSetup } from "../state/onboarding";
import { useRelays } from "../state/relay";
import { connectionIcon, connectionKind, connectionProvider, isLocalSource, isPendingSource, sourceCandidates } from "../sourcePresentation";
import type { Ingress } from "../state/types";
import IngressDialog from "./IngressDialog";
import ChangeConnection from "./ChangeConnection";
import AddConnection from "./AddConnection";
import Onboarding from "./Onboarding";
import SourcePanel from "./SourcePanel";
import { Sensitive } from "./Sensitive";
import { ApprovalCard } from "./OAuthApproval";
import { RelaySettings } from "./RelaySettings";

const grouping = preference<"all" | "platform">("arc.source-grouping", "all");
export default function RemoteLinkPage() {
  const { status, sources, error: readError } = connector.use(), nav = navigation.use(), relays = useRelays();
  const group = grouping.use(), switching = connectionSwitch.use(), newConnection = connectionSetup.use(), flow = onboarding.use();
  const [editing, setEditing] = useState<Ingress>(), [error, setError] = useState("");
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
        : prior && nav.remoteSourceId && !nav.remoteConnectionId ? document.querySelector<HTMLElement>("[data-source-connection]")
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
  return <div className="remote-link-page">
    {readError && <Notice>{readError}</Notice>}
    {connection ? <div className="connection-detail">
      <SectionHeader className="connection-detail-heading" level={2} leading={<><span className="connection-detail-icon"><Icon icon={connectionIcon(connection)} size={20} /></span></>} title={<>{connection.name}</>} secondary={<><p>{connectionProvider(connection)}{selectedRelay?.owner ? ` · ${t("setup.hostedHere")}` : ""}</p></>} actions={<><StateBadge presentation={statePresentation("connection", ingressState(connection))} /></>} />
      {connection.url && <Address value={connection.url} label={t("source.copyAddress")} />}
      <section className="connection-sources"><SectionHeader level={3} title={<>{t("setup.sourcesUsing", { count: affected.length })}</>} actions={<><Button data-add-source onClick={() => openOnboarding("product", { ingressId: connection.id, fixedConnection: true })}>{t("setup.addSourceForConnection")}</Button></>} />
        <HoverScope>{affected.map(source => <EntityRow key={source.id} className="remote-entity-row" onClick={() => navigation.set(old => ({ ...old, remoteSourceId: source.id, remoteConnectionId: undefined }))} leading={<><PlatformIcon role="source" platform={source.product} /></>} title={<>{source.label}</>} state={<><StateBadge presentation={statePresentation("source", source?.pendingSwitch ? "pending-switch" : source?.state)} /></>} chevron />)}</HoverScope>
        {!affected.length && <p className="muted">{t("source.unused")}</p>}
      </section>
      <EntityCard variant="outline"><FactList missing={{ placeholder: '—' }} items={[
        { label: t("source.provider"), value: connection.transport === "relay" ? "Cloudflare Workers" : connectionProvider(connection) },
        { label: t("connectionMethod"), value: t(`source.kind.${connectionKind(connection)}`) },
        ...(selectedRelay ? [{ label: t("setup.workerVersion"), value: selectedRelay.workerVersion }] : []),
      ]} /></EntityCard>
      {connection.error && <Notice>{connection.error}</Notice>}
      {selectedRelay && <RelaySettings relay={selectedRelay} version={relays.version} refresh={relays.refresh} />}
      {!["local", "relay"].includes(connection.transport) && <Button onClick={() => setEditing(connection)}>{t("edit")}</Button>}
      {selectedRelay?.owner && <Button className="connection-hosting-link" variant="ghost" onClick={() => navigation.set(old => ({ ...old, page: "settings", settingsExtras: true }))}>{t("setup.hostingLink")}<Icon icon={ChevronRight} /></Button>}
      <div className="connection-remove"><div><strong>{t(joined ? "connect.leave" : "setup.removeConnection")}</strong><p>{t("setup.removeAffected", { names: affected.map(s => s.label).join(", ") || t("source.unused") })}</p></div><Button variant="danger-outline" onClick={() => { setError(""); setRemoving(true); }}>{t(joined ? "connect.leave" : "remove")}</Button></div>
    </div> : <>
      <SectionHeader level={3} titleAsChild title={<><SingleChoice compact label={t("source.grouping")} value={group} onChange={value => grouping.set(value as "all" | "platform")} options={[{ value: "all", label: t("all") }, { value: "platform", label: t("source.byPlatform") }]} /></>} actions={<><Button data-add-source variant="primary" onClick={() => add()}>{t("addControlSource")}</Button></>} />
      {requests.filter(({ ingress, request }) => request.switchSourceId || sourceCandidates(sources, entries, ingress.id, request.product ?? "custom", request.sourceId).length > 0).map(({ ingress, request }) => <Notice key={request.id} tone="warning" action={<Button onClick={() => setClaim(request.id)}>{t("source.review")}</Button>}>{t("source.pendingReauthorization", { name: request.clientName, connection: ingress.name })}</Notice>)}
      <HoverScope>{groups.map(platform => <section key={platform} className="source-list">
        {platform && <h3>{t(`source.platform.${platform}`) === `source.platform.${platform}` ? platform : t(`source.platform.${platform}`)}</h3>}
        {visible.filter(s => !platform || s.platform === platform).map(source => {
          const ingress = entries.find(i => i.id === source.ingressId);
          return <EntityRow key={source.id} className="remote-entity-row" data-hover-target={source.id} data-remote-row={source.id} onClick={() => navigation.set(old => ({ ...old, remoteSourceId: source.id }))} leading={<><PlatformIcon role="source" platform={source.product} /></>} title={<>{source.label}</>} secondary={<><Tag>{ingress?.name ?? source.connectionName ?? t("source.connectionRemoved")}</Tag></>} state={<><StateBadge presentation={statePresentation("source", source.pendingSwitch ? "pending-switch" : source.state)} /></>} chevron />;
        })}
      </section>)}</HoverScope>
      {!visible.length && <Empty>{t("source.empty")}</Empty>}
      <section className="connection-list"><SectionHeader level={3} title={<>{t("source.connections")}</>} actions={<><Button data-new-connection onClick={() => add(true)}>{t("source.newConnection")}</Button></>} />
        <HoverScope>{entries.map(ingress => {
          const count = visible.filter(s => s.ingressId === ingress.id).length;
          return <EntityRow key={ingress.id} className="remote-entity-row remote-connection-row" data-hover-target={ingress.id} data-remote-row={ingress.id} onClick={() => navigation.set(old => ({ ...old, remoteConnectionId: ingress.id }))} leading={<><Icon icon={connectionIcon(ingress)} size={20} /></>} title={<>{ingress.name}</>} secondary={<>{ingress.url ? <Sensitive>{ingress.url}</Sensitive> : connectionProvider(ingress)}</>} state={<><span className="muted">{t(count ? "source.count" : "source.unused", { count })}</span><StateBadge presentation={statePresentation("connection", ingressState(ingress))} /></>} chevron />;
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
