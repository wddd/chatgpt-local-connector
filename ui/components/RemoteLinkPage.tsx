import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { preference } from "../state/store";
import { navigation } from "../state/navigation";
import { openOnboarding } from "../state/onboarding";
import { useRelays } from "../state/relay";
import { connectionIcon, connectionKind, connectionProvider, isPendingSource, sourceCandidates } from "../sourcePresentation";
import type { Ingress } from "../state/types";
import IngressDialog from "./IngressDialog";
import SourceDetail from "./SourceDetail";
import SourceIcon from "./SourceIcon";
import { ApprovalCard } from "./OAuthApproval";
import { RelaySettings } from "./RelaySettings";
import { Button, CopyField, Dialog, Empty, HoverScope, Icon, Notice, SingleChoice, Status, Tag } from "./ui";

const grouping = preference<"all" | "platform">("arc.source-grouping", "all");
export default function RemoteLinkPage() {
  const { status, sources, error: readError } = connector.use(), nav = navigation.use(), relays = useRelays();
  const group = grouping.use();
  const [editing, setEditing] = useState<Ingress>(), [error, setError] = useState("");
  const [claim, setClaim] = useState<string>();
  const previous = useRef<string | undefined>(undefined);
  const entries = status?.ingresses ?? [];
  const visible = sources.filter(s => !isPendingSource(s, entries));
  const selected = sources.find(s => s.id === nav.remoteSourceId);
  const connection = entries.find(i => i.id === nav.remoteConnectionId);
  const selectedRelay = relays.relays.find(r => r.ingressId === connection?.id);
  const requests = entries.flatMap(ingress => (ingress.oauth?.pending ?? []).filter(request => request.status === "pending").map(request => ({ ingress, request })));
  const claiming = requests.find(p => p.request.id === claim);
  useEffect(() => {
    const current = nav.remoteConnectionId ?? nav.remoteSourceId;
    const prior = previous.current;
    const frame = requestAnimationFrame(() => {
      const target = !current && prior ? document.querySelector<HTMLElement>(`[data-remote-row="${CSS.escape(prior)}"]`)
        : prior && nav.remoteSourceId && !nav.remoteConnectionId ? document.querySelector<HTMLElement>("[data-source-connection]")
        : current ? document.querySelector<HTMLElement>(".sheet-header h1") : null;
      target?.focus({ preventScroll: true });
    });
    previous.current = current;
    return () => cancelAnimationFrame(frame);
  }, [nav.remoteSourceId, nav.remoteConnectionId]);
  function add(connectionOnly = false) {
    navigation.set(old => ({ ...old, page: "overview" }));
    openOnboarding(connectionOnly ? "connection" : "product");
  }
  const groups = group === "platform" ? [...new Set(visible.map(s => s.platform))].sort() : [""];
  return <div className="remote-link-page">
    {readError && <Notice>{readError}</Notice>}
    {connection ? <div className="connection-detail">
      <div className="source-section-heading"><Icon icon={connectionIcon(connection)} size={20} /><span>{t(`source.kind.${connectionKind(connection)}`)}</span><Status tone={connection.state === "ready" ? "success" : "neutral"}>{t(connection.state === "ready" ? "connect.online" : "connect.offline")}</Status></div>
      {connection.transport !== "relay" && connection.url && <CopyField value={connection.url} label={t("source.copyAddress")} />}
      <dl className="source-facts"><div><dt>{t("source.provider")}</dt><dd>{connectionProvider(connection)}</dd></div></dl>
      {connection.error && <Notice>{connection.error}</Notice>}
      {selectedRelay && <RelaySettings relay={selectedRelay} version={relays.version} refresh={relays.refresh} />}
      {!["local", "relay"].includes(connection.transport) && <Button onClick={() => setEditing(connection)}>{t("edit")}</Button>}
      <Button onClick={() => add(true)}>{t("source.newConnection")}</Button>
    </div> : selected ? <SourceDetail key={selected.id} source={selected} onConnection={id => navigation.set(old => ({ ...old, remoteConnectionId: id }))} /> : <>
      <div className="source-section-heading"><SingleChoice compact label={t("source.grouping")} value={group} onChange={value => grouping.set(value as "all" | "platform")} options={[{ value: "all", label: t("all") }, { value: "platform", label: t("source.byPlatform") }]} /><Button variant="primary" onClick={() => add()}>{t("addControlSource")}</Button></div>
      {requests.filter(({ ingress, request }) => sourceCandidates(sources, entries, ingress.id, request.product ?? "custom", request.sourceId).length > 0).map(({ ingress, request }) => <Notice key={request.id} tone="warning" action={<Button onClick={() => setClaim(request.id)}>{t("source.review")}</Button>}>{t("source.pendingReauthorization", { name: request.clientName, connection: ingress.name })}</Notice>)}
      <HoverScope>{groups.map(platform => <section key={platform} className="source-list">
        {platform && <h3>{t(`source.platform.${platform}`) === `source.platform.${platform}` ? platform : t(`source.platform.${platform}`)}</h3>}
        {visible.filter(s => !platform || s.platform === platform).map(source => {
          const ingress = entries.find(i => i.id === source.ingressId);
          return <Button key={source.id} variant="ghost" className="source-list-row" data-hover-target={source.id} data-remote-row={source.id} onClick={() => navigation.set(old => ({ ...old, remoteSourceId: source.id }))}>
            <SourceIcon platform={source.product} /><strong>{source.label}</strong><Tag>{ingress?.name ?? t("source.connectionRemoved")}</Tag>
            <Status tone={source.state === "connected" ? "success" : "neutral"}>{t(`source.state.${source.state}`)}</Status><Icon icon={ChevronRight} />
          </Button>;
        })}
      </section>)}</HoverScope>
      {!visible.length && <Empty>{t("source.empty")}</Empty>}
      <section className="connection-list"><div className="source-section-heading"><h3>{t("source.connections")}</h3><Button onClick={() => add(true)}>{t("source.newConnection")}</Button></div>
        <HoverScope>{entries.map(ingress => {
          const count = visible.filter(s => s.ingressId === ingress.id && s.state !== "revoked").length;
          return <Button key={ingress.id} variant="ghost" className="source-list-row connection-list-row" data-hover-target={ingress.id} data-remote-row={ingress.id} onClick={() => navigation.set(old => ({ ...old, remoteConnectionId: ingress.id }))}>
            <Icon icon={connectionIcon(ingress)} size={20} /><span className="connection-list-copy"><strong>{ingress.name}</strong><span>{ingress.url || connectionProvider(ingress)}</span></span>
            <span className="muted">{t(count ? "source.count" : "source.unused", { count })}</span><Status tone={ingress.state === "ready" ? "success" : "neutral"}>{t(ingress.state === "ready" ? "connect.online" : "connect.offline")}</Status><Icon icon={ChevronRight} />
          </Button>;
        })}</HoverScope>
      </section>
    </>}
    {(error || relays.error) && <Notice>{error || t("connect.readFailed")}</Notice>}
    {claiming && <Dialog title={t("source.authorization")} onClose={() => setClaim(undefined)}><ApprovalCard key={claiming.request.id} {...claiming} onDecided={() => setClaim(undefined)} /></Dialog>}
    {editing && <IngressDialog ingress={editing} onClose={() => setEditing(undefined)} onRemoved={() => { setEditing(undefined); navigation.set(old => ({ ...old, remoteConnectionId: undefined })); }} onSaved={entry => {
      setEditing(undefined); void api(`ingress/${entry.id}/start`, "POST").then(refreshConnector).catch(e => setError(String(e)));
    }} />}
  </div>;
}
