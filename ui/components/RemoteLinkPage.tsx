import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { preference } from "../state/store";
import { navigation } from "../state/navigation";
import { onboarding, openOnboarding, openConnectionSetup, connectionSwitch, connectionSetup } from "../state/onboarding";
import { useRelays } from "../state/relay";
import { connectionIcon, connectionKind, connectionProvider, isPendingSource, sourceCandidates } from "../sourcePresentation";
import type { Ingress } from "../state/types";
import IngressDialog from "./IngressDialog";
import ChangeConnection from "./ChangeConnection";
import AddConnection from "./AddConnection";
import Onboarding from "./Onboarding";
import SourcePanel from "./SourcePanel";
import { Private } from "./Privacy";
import SourceIcon from "./SourceIcon";
import { ApprovalCard } from "./OAuthApproval";
import { RelaySettings } from "./RelaySettings";
import { Button, CopyField, Dialog, Empty, HoverScope, Icon, Notice, SingleChoice, Status, Tag } from "./ui";

const grouping = preference<"all" | "platform">("arc.source-grouping", "all");
export default function RemoteLinkPage() {
  const { status, sources, error: readError } = connector.use(), nav = navigation.use(), relays = useRelays();
  const group = grouping.use(), switching = connectionSwitch.use(), newConnection = connectionSetup.use(), flow = onboarding.use();
  const [editing, setEditing] = useState<Ingress>(), [error, setError] = useState("");
  const [removing, setRemoving] = useState(false), [removeBusy, setRemoveBusy] = useState(false);
  const [claim, setClaim] = useState<string>();
  const previous = useRef<string | undefined>(undefined);
  const entries = status?.ingresses ?? [];
  const visible = sources.filter(s => s.state !== "revoked" && !isPendingSource(s, entries));
  const selected = sources.find(s => s.id === nav.remoteSourceId);
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
      <div className="connection-detail-heading"><span className="connection-detail-icon"><Icon icon={connectionIcon(connection)} size={20} /></span><div><h2>{connection.name}</h2><p>{connectionProvider(connection)}{selectedRelay?.owner ? ` · ${t("setup.hostedHere")}` : ""}</p></div><Status tone={connection.state === "ready" ? "success" : "neutral"}>{t(connection.state === "ready" ? "connect.online" : "connect.offline")}</Status></div>
      {connection.url && <CopyField value={connection.url} label={t("source.copyAddress")} />}
      <section className="connection-sources"><div className="source-section-heading"><h3>{t("setup.sourcesUsing", { count: affected.length })}</h3><Button data-add-source onClick={() => openOnboarding("product", { ingressId: connection.id, fixedConnection: true })}>{t("setup.addSourceForConnection")}</Button></div>
        <HoverScope>{affected.map(source => <Button key={source.id} variant="ghost" className="connection-source-row" onClick={() => navigation.set(old => ({ ...old, remoteSourceId: source.id, remoteConnectionId: undefined }))}><SourceIcon platform={source.product} /><strong>{source.label}</strong><Status tone={source.state === "connected" ? "success" : "neutral"}>{t(`source.state.${source.state}`)}</Status><Icon icon={ChevronRight} /></Button>)}</HoverScope>
        {!affected.length && <p className="muted">{t("source.unused")}</p>}
      </section>
      <dl className="source-facts connection-provider-facts"><div><dt>{t("source.provider")}</dt><dd>{connection.transport === "relay" ? "Cloudflare Workers" : connectionProvider(connection)}</dd></div><div><dt>{t("connectionMethod")}</dt><dd>{t(`source.kind.${connectionKind(connection)}`)}</dd></div>{selectedRelay && <div><dt>{t("setup.workerVersion")}</dt><dd>{selectedRelay.workerVersion ?? "—"}</dd></div>}</dl>
      {connection.error && <Notice>{connection.error}</Notice>}
      {selectedRelay && <RelaySettings relay={selectedRelay} version={relays.version} refresh={relays.refresh} />}
      {!["local", "relay"].includes(connection.transport) && <Button onClick={() => setEditing(connection)}>{t("edit")}</Button>}
      {selectedRelay?.owner && <Button className="connection-hosting-link" variant="ghost" onClick={() => navigation.set(old => ({ ...old, page: "settings", settingsExtras: true }))}>{t("setup.hostingLink")}<Icon icon={ChevronRight} /></Button>}
      <div className="connection-remove"><div><strong>{t(joined ? "connect.leave" : "setup.removeConnection")}</strong><p>{t("setup.removeAffected", { names: affected.map(s => s.label).join(", ") || t("source.unused") })}</p></div><Button variant="danger-outline" onClick={() => { setError(""); setRemoving(true); }}>{t(joined ? "connect.leave" : "remove")}</Button></div>
    </div> : <>
      <div className="source-section-heading"><SingleChoice compact label={t("source.grouping")} value={group} onChange={value => grouping.set(value as "all" | "platform")} options={[{ value: "all", label: t("all") }, { value: "platform", label: t("source.byPlatform") }]} /><Button data-add-source variant="primary" onClick={() => add()}>{t("addControlSource")}</Button></div>
      {requests.filter(({ ingress, request }) => request.switchSourceId || sourceCandidates(sources, entries, ingress.id, request.product ?? "custom", request.sourceId).length > 0).map(({ ingress, request }) => <Notice key={request.id} tone="warning" action={<Button onClick={() => setClaim(request.id)}>{t("source.review")}</Button>}>{t("source.pendingReauthorization", { name: request.clientName, connection: ingress.name })}</Notice>)}
      <HoverScope>{groups.map(platform => <section key={platform} className="source-list">
        {platform && <h3>{t(`source.platform.${platform}`) === `source.platform.${platform}` ? platform : t(`source.platform.${platform}`)}</h3>}
        {visible.filter(s => !platform || s.platform === platform).map(source => {
          const ingress = entries.find(i => i.id === source.ingressId);
          return <Button key={source.id} variant="ghost" className="source-list-row" data-hover-target={source.id} data-remote-row={source.id} onClick={() => navigation.set(old => ({ ...old, remoteSourceId: source.id }))}>
            <SourceIcon platform={source.product} /><strong>{source.label}</strong><Tag>{ingress?.name ?? source.connectionName ?? t("source.connectionRemoved")}</Tag>
            <Status tone={source.pendingSwitch ? "warning" : source.state === "connected" ? "success" : "neutral"}>{t(source.pendingSwitch ? "switch.pending" : `source.state.${source.state}`)}</Status><Icon icon={ChevronRight} />
          </Button>;
        })}
      </section>)}</HoverScope>
      {!visible.length && <Empty>{t("source.empty")}</Empty>}
      <section className="connection-list"><div className="source-section-heading"><h3>{t("source.connections")}</h3><Button data-new-connection onClick={() => add(true)}>{t("source.newConnection")}</Button></div>
        <HoverScope>{entries.map(ingress => {
          const count = visible.filter(s => s.ingressId === ingress.id).length;
          return <Button key={ingress.id} variant="ghost" className="source-list-row connection-list-row" data-hover-target={ingress.id} data-remote-row={ingress.id} onClick={() => navigation.set(old => ({ ...old, remoteConnectionId: ingress.id }))}>
            <Icon icon={connectionIcon(ingress)} size={20} /><span className="connection-list-copy"><strong>{ingress.name}</strong><Private>{ingress.url || connectionProvider(ingress)}</Private></span>
            <span className="muted">{t(count ? "source.count" : "source.unused", { count })}</span><Status tone={ingress.state === "ready" ? "success" : "neutral"}>{t(ingress.state === "ready" ? "connect.online" : "connect.offline")}</Status><Icon icon={ChevronRight} />
          </Button>;
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
