import { useEffect, useState } from "react";
import { api } from "../api";
import { locale, t } from "../i18n";
import { copyText } from "../platform";
import { connector, notify, refreshConnector } from "../state/connector";
import { openOnboarding } from "../state/onboarding";
import { navigation } from "../state/navigation";
import { useRelays, useRelayProgress, type Relay } from "../state/relay";
import { useSetup } from "../state/setup";
import type { Ingress } from "../state/types";
import IngressDialog from "./IngressDialog";
import SetupDialog from "./SetupDialog";
import RelayProgress from "./RelayProgress";
import { Button, CopyField, Dialog, Group, Notice, Row, Status } from "./ui";

type Member = { id: string; name: string; joinedAt: string; lastOnline: string | null; online: boolean };
function RelaySettings({ relay, version, refresh }: { relay: Relay; version: string; refresh: () => Promise<unknown> }) {
  const { status } = connector.use();
  const ingress = status?.ingresses.find(i => i.id === relay.ingressId);
  const [members, setMembers] = useState<Member[]>([]), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [confirm, setConfirm] = useState<"delete" | "leave" | Member>();
  const [operation, setOperation] = useState(""), [account, setAccount] = useState("");
  const { progress, setProgress, error: progressError } = useRelayProgress(!!operation, () => {
    setOperation(""); void refresh().catch(() => {}); void refreshConnector().catch(() => {});
  });
  useEffect(() => {
    void api<import("../state/relay").RelayProgress>("relay/progress").then(value => {
      if (value.relayId === relay.id && ["login", "deploying", "connecting", "failed"].includes(value.phase) && value.action) {
        setProgress(value); setOperation(value.action);
      }
    }).catch(() => {});
  }, [relay.id]);
  async function readMembers() {
    if (relay.owner && relay.url) setMembers(await api<Member[]>("relay/instances", "POST", { id: relay.id }));
  }
  useEffect(() => { void readMembers().catch(() => setError(t("connect.membersFailed"))); }, [relay.id, relay.url]);
  async function action(name: string, extra = {}) {
    setBusy(name); setError("");
    try {
      const value = await api<import("../state/relay").RelayProgress & { link?: string }>(`relay/${name}`, "POST", { id: relay.id, ...extra });
      if (value.jobId) { setProgress(value); setOperation(name); }
      if (value.link) { await copyText(value.link); notify(t("connect.shareCopied")); }
      if (["remove", "leave"].includes(name)) { await refresh(); await refreshConnector(); }
      if (name === "remove") await readMembers();
      setConfirm(undefined); return true;
    } catch { setError(t("connect.actionFailed")); return false; }
    finally { setBusy(""); }
  }
  const date = (value: string | null) => value ? new Date(value).toLocaleString(locale.get(), { hour12: false }) : t("connect.neverOnline");
  return <section className="relay-settings">
    <Row title={t(relay.owner ? "connect.myRelay" : "connect.usingShared")} description={relay.owner ? t("connect.cloudflareManaged") : undefined}>
      <Status tone={ingress?.state === "ready" ? "success" : "neutral"}>{t(ingress?.state === "ready" ? "connect.online" : "connect.offline")}</Status>
      <Button disabled={!!busy || !!operation} onClick={() => setConfirm(relay.owner ? "delete" : "leave")}>{t(relay.owner ? "delete" : "connect.leave")}</Button>
    </Row>
    {ingress?.url && <CopyField value={ingress.url} label={t("connect.remoteLink")} />}
    {ingress?.state !== "ready" && !operation && <Button disabled={!!busy} onClick={() => void action(relay.url ? "connect" : "redeploy")}>{t("retry")}</Button>}
    {relay.owner && relay.workerVersion !== version && !operation && <Notice action={<Button disabled={!!busy} onClick={() => void action("redeploy")}>{t("connect.updateRelay")}</Button>}>{t("connect.updateAvailable")}</Notice>}
    {operation && <>
      {progressError && <Notice>{t("connect.readFailed")}</Notice>}
      <RelayProgress progress={progress} busy={!!busy} account={account} setAccount={setAccount} onCancel={() => void action("cancel").then(ok => { if (ok) setOperation(""); })} onRetry={() => {
        if (operation === "join") { navigation.set(old => ({ ...old, page: "overview" })); openOnboarding("remote", "join"); }
        else void action(operation === "create" ? "redeploy" : operation, account ? { accountId: account } : {});
      }} />
    </>}
    {relay.owner && relay.url && <>
      <h3>{t("connect.sharedRelay")}</h3><p className="muted small">{t("connect.shareBoundary")}</p>
      <div className="actions"><Button busy={busy === "reset-token"} disabled={!!busy || !!operation} onClick={() => void action("reset-token")}>{t("connect.resetLink")}</Button><Button busy={busy === "share"} disabled={!!busy || !!operation} onClick={() => void action("share")}>{t("connect.copyShared")}</Button><Button disabled={!!busy || !!operation} onClick={() => void readMembers().catch(() => setError(t("connect.membersFailed")))}>{t("refresh")}</Button></div>
      {members.map(member => <Row key={member.id} title={<Status tone={member.online ? "success" : "neutral"}>{member.name}</Status>} description={t("connect.memberTimes", { joined: date(member.joinedAt), seen: date(member.lastOnline) })}><Button disabled={!!busy || !!operation} onClick={() => setConfirm(member)}>{t("remove")}</Button></Row>)}
    </>}
    {error && <Notice tone="danger">{error}</Notice>}
    {confirm && <Dialog title={t(typeof confirm === "string" ? `connect.confirm.${confirm}` : "connect.confirm.remove")} width={420} onClose={() => setConfirm(undefined)} busy={!!busy} footer={<><Button disabled={!!busy} onClick={() => setConfirm(undefined)}>{t("cancel")}</Button><Button variant="danger" busy={!!busy} onClick={() => void action(typeof confirm === "string" ? confirm : "remove", typeof confirm === "object" ? { instanceId: confirm.id } : {})}>{t("confirm")}</Button></>}><p>{t(confirm === "delete" ? "connect.deleteHint" : "connect.removeHint")}</p>{error && <Notice>{error}</Notice>}</Dialog>}
  </section>;
}
export default function RemoteLinkSettings() {
  const relays = useRelays(), { status } = connector.use(), nav = navigation.use();
  const [advanced, setAdvanced] = useState(!!nav.remoteAdvanced);
  const [editing, setEditing] = useState<Ingress | "new">();
  const [agentMode, setAgentMode] = useState<"entry" | "progress" | null>(null);
  const [revoking, setRevoking] = useState(""), [error, setError] = useState("");
  const setup = useSetup(!!agentMode);
  useEffect(() => { if (nav.remoteAdvanced) { setAdvanced(true); navigation.set(old => ({ ...old, remoteAdvanced: undefined })); } }, [nav.remoteAdvanced]);
  const entries = status?.ingresses ?? [];
  function launch(step: "remote" | "local" | "sources") { navigation.set(old => ({ ...old, page: "overview" })); openOnboarding(step); }
  return <Group title={t("connect.remoteLink")}>
    {relays.relays.map(relay => <RelaySettings key={relay.id} relay={relay} version={relays.version} refresh={relays.refresh} />)}
    {entries.filter(i => i.transport !== "relay" && i.transport !== "local" && i.url).map(i => <Row key={i.id} title={i.name}><Status tone={i.state === "ready" ? "success" : "neutral"}>{t(i.state === "ready" ? "connect.online" : "connect.offline")}</Status><Button onClick={() => void copyText(i.url).catch(() => setError(t("connect.actionFailed")))}>{t("connect.copyLink")}</Button></Row>)}
    <div className="actions"><Button variant="primary" onClick={() => launch(relays.relays.length || entries.some(i => i.url) ? "sources" : "remote")}>{t(relays.relays.length || entries.some(i => i.url) ? "addControlSource" : "connect.title.remote")}</Button><Button onClick={() => launch("local")}>{t("connect.localTitle")}</Button></div>
    <section className="approved-sources"><h3>{t("connect.approved")}</h3>
      {entries.flatMap(i => (i.oauth?.grants ?? []).map(grant => <Row key={`${i.id}:${grant.id}`} title={grant.clientName}><Button busy={revoking === grant.id} disabled={!!revoking} onClick={() => { setRevoking(grant.id); setError(""); void api(`ingress/${i.id}/oauth/revoke`, "POST", { id: grant.id }).then(refreshConnector).catch(() => setError(t("connect.actionFailed"))).finally(() => setRevoking("")); }}>{t("oauthRevoke")}</Button></Row>))}
    </section>
    {(error || relays.error) && <Notice>{error || t("connect.readFailed")}</Notice>}
    <details className="remote-advanced" open={advanced} onToggle={e => setAdvanced(e.currentTarget.open)}>
      <summary>{t("connect.advanced")}</summary>
      {entries.filter(i => !["relay", "local"].includes(i.transport)).map(i => <Row key={i.id} title={i.name}><Button onClick={() => setEditing(i)}>{t("edit")}</Button></Row>)}
      <div className="actions"><Button onClick={() => setEditing("new")}>{t("connect.customAddress")}</Button><Button onClick={() => setAgentMode("entry")}>{t("setup.sendCodex")}</Button></div>
    </details>
    {editing && <IngressDialog ingress={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onRemoved={() => setEditing(undefined)} onSaved={entry => { setEditing(undefined); void api(`ingress/${entry.id}/start`, "POST").then(refreshConnector).catch(() => setError(t("connect.actionFailed"))); }} />}
    {agentMode && <SetupDialog mode={agentMode} setMode={setAgentMode} snapshot={setup.snapshot} error={setup.error} refresh={setup.refresh} onClose={() => setAgentMode(null)} onManual={() => { setAgentMode(null); setEditing("new"); }} />}
  </Group>;
}
