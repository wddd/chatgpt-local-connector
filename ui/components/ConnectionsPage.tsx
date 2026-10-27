import { useState } from "react";
import { api } from "../api";
import { t, locale } from "../i18n";
import { openUrl } from "../platform";
import { connector, refreshConnector } from "../state/connector";
import { useRelays, publicRelay } from "../state/relay";
import { TunnelCard, TunnelRow, LocalConnectionRow } from "./objects/tunnel";
import { Button, Notice } from "./ui";
import PublicLinkDeployment from "./PublicLinkDeployment";

export default function ConnectionsPage() {
  const { status, error: readError } = connector.use(), relays = useRelays();
  const [deploying, setDeploying] = useState(false), [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const relay = publicRelay(relays.relays), entries = status?.ingresses ?? [];
  const publicLink = entries.find(entry => entry.id === relay?.ingressId);
  async function toggle() {
    if (!publicLink) return;
    const { id, running, enabled } = publicLink;
    setBusy(id); setError("");
    try {
      if (!running && !enabled) await api(`ingress/${id}`, "PUT", { enabled: true });
      await api(`ingress/${id}/${running ? "stop" : "start"}`, "POST"); await refreshConnector();
    } catch (e) { setError(String(e)); } finally { setBusy(""); }
  }
  return <div className="grid min-w-0 gap-4">
    {relays.loaded && !relay && relays.relays.some(item => item.owner) && <Notice>{t("connections.multiplePublicLinks")}</Notice>}
    {(error || readError || relays.error) && <Notice action={<Button onClick={() => void Promise.all([refreshConnector(), relays.refresh()]).catch(e => setError(String(e)))}>{t("retry")}</Button>}>{error || readError || relays.error}</Notice>}
    {deploying ? <PublicLinkDeployment relayId={relay?.id} onReady={() => { setDeploying(false); void relays.refresh().catch(e => setError(String(e))); }} onCancel={() => { setDeploying(false); void relays.refresh().catch(e => setError(String(e))); }} />
      : publicLink ? <TunnelCard ingress={publicLink} title={t("connections.publicLink")} busy={!!busy}
        headerActions={<Button disabled={!!busy || ["starting", "stopping"].includes(publicLink.state)} onClick={() => void toggle()}>{t(publicLink.running ? "stop" : "start")}</Button>} />
      : relays.loaded && !relays.error && (relay || !relays.relays.some(item => item.owner)) && <Button className="justify-self-start" variant="primary" onClick={() => setDeploying(true)}>{t(relay ? "retry" : "source.createRelay")}</Button>}
    <LocalConnectionRow ingresses={status?.ingresses} />
    {entries.filter(entry => entry.transport !== "local" && entry.id !== publicLink?.id).map(entry => <TunnelRow key={entry.id} ingress={entry} />)}
    <Button className="justify-self-start" variant="link" onClick={() => void openUrl(`https://github.com/whzxc/agent-remote-control/blob/main/docs/${locale.get() === "zh-CN" ? "zh-CN/" : ""}guides/connections.md`).catch(e => setError(String(e)))}>{t("connections.otherMethods")}</Button>
  </div>;
}
