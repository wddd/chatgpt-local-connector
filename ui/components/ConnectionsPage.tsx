import { useState } from "react";
import { api } from "../api";
import { t, locale } from "../i18n";
import { openUrl } from "../platform";
import { connector, refreshConnector } from "../state/connector";
import { useRelays, publicRelay } from "../state/relay";
import { TunnelCard, TunnelRow } from "./objects/tunnel";
import { Button, Notice } from "./ui";
import SourceConnectionSetup from "./SourceConnectionSetup";

export default function ConnectionsPage() {
  const { status, sources, error: readError } = connector.use(), relays = useRelays();
  const [deploying, setDeploying] = useState(false), [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // Phase 3 will establish a canonical public-link identity. Until then, expose
  // a unique owned relay; multiple owned relays remain read-only.
  const publicId = publicRelay(relays.relays)?.ingressId;
  const entries = status?.ingresses ?? [];
  const basic = [...entries.filter(entry => entry.id === publicId), ...entries.filter(entry => entry.transport === "local" && entry.id !== publicId)];
  async function toggle(id: string, running: boolean) {
    setBusy(id); setError("");
    try {
      if (!running && !entries.find(entry => entry.id === id)?.enabled) await api(`ingress/${id}`, "PUT", { enabled: true });
      await api(`ingress/${id}/${running ? "stop" : "start"}`, "POST"); await refreshConnector(); }
    catch (e) { setError(String(e)); } finally { setBusy(""); }
  }
  return <div className="grid min-w-0 gap-4">
    {relays.relays.filter(relay => relay.owner).length > 1 && <Notice>{t("connections.multiplePublicLinks")}</Notice>}
    {(error || readError || relays.error) && <Notice>{error || readError || relays.error}</Notice>}
    {relays.loaded && !relays.error && !relays.relays.some(relay => relay.owner) && <Button className="justify-self-start" variant="primary" onClick={() => setDeploying(true)}>{t("source.createRelay")}</Button>}
    {basic.map(entry => <TunnelCard key={entry.id} ingress={entry} sources={sources} busy={busy === entry.id}
      headerActions={<Button disabled={!!busy || ["starting", "stopping"].includes(entry.state)} onClick={() => void toggle(entry.id, entry.running)}>{t(entry.running ? "stop" : "start")}</Button>} />)}
    {entries.filter(entry => !basic.includes(entry)).map(entry => <TunnelRow key={entry.id} ingress={entry} sources={sources} />)}
    <Button className="justify-self-start" variant="link" onClick={() => void openUrl(`https://github.com/whzxc/agent-remote-control/blob/main/docs/${locale.get() === "zh-CN" ? "zh-CN/" : ""}guides/connections.md`).catch(e => setError(String(e)))}>{t("connections.otherMethods")}</Button>
    {deploying && <SourceConnectionSetup options={{}} onClose={() => setDeploying(false)} onAdded={() => { setDeploying(false); void relays.refresh().catch(e => setError(String(e))); }} />}
  </div>;
}
