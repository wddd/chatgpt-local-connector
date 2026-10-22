import { useEffect, useState } from "react";
import { api } from "../api";
import { locale, t } from "../i18n";
import { copyText } from "../platform";
import { connector, notify, refreshConnector } from "../state/connector";
import { openOnboarding } from "../state/onboarding";
import { navigation } from "../state/navigation";
import { useRelays, useRelayProgress, type Relay } from "../state/relay";
import RelayProgress from "./RelayProgress";
import { Button, CopyField, Dialog, Group, Notice, Row, Status } from "./ui";
type Member = { id: string; name: string; joinedAt: string; lastOnline: string | null; online: boolean };
export function RelaySettings({ relay, version, refresh, hosting = false }: { relay: Relay; version: string; refresh: () => Promise<unknown>; hosting?: boolean }) {
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
    if (hosting && relay.owner && relay.url) setMembers(await api<Member[]>("relay/instances", "POST", { id: relay.id }));
  }
  useEffect(() => { void readMembers().catch(() => setError(t("connect.membersFailed"))); }, [hosting, relay.id, relay.url]);
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
    <Row title={relay.name}>
      <Status tone={ingress?.state === "ready" ? "success" : "neutral"}>{t(ingress?.state === "ready" ? "connect.online" : "connect.offline")}</Status>
      {(hosting || !relay.owner) && <Button disabled={!!busy || !!operation} onClick={() => setConfirm(hosting ? "delete" : "leave")}>{t(hosting ? "delete" : "connect.leave")}</Button>}
    </Row>
    {ingress?.url && <CopyField value={ingress.url} label={t("connect.remoteLink")} />}
    {ingress?.state !== "ready" && !operation && <Button disabled={!!busy} onClick={() => void action(relay.url ? "connect" : "redeploy")}>{t("retry")}</Button>}
    {relay.owner && relay.workerVersion !== version && !operation && <Notice action={<Button disabled={!!busy} onClick={() => void action("redeploy")}>{t("connect.updateRelay")}</Button>}>{t("connect.updateAvailable")}</Notice>}
    {operation && <>
      {progressError && <Notice>{t("connect.readFailed")}</Notice>}
      <RelayProgress progress={progress} busy={!!busy} account={account} setAccount={setAccount} onCancel={() => void action("cancel").then(ok => { if (ok) setOperation(""); })} onRetry={() => {
        if (operation === "join") { navigation.set(old => ({ ...old, page: "overview" })); openOnboarding("product", "join"); }
        else void action(operation === "create" ? "redeploy" : operation, account ? { accountId: account } : {});
      }} />
    </>}
    {hosting && relay.owner && relay.url && <>
      <h3>{t("connect.sharedRelay")}</h3>
      <div className="actions"><Button busy={busy === "reset-token"} disabled={!!busy || !!operation} onClick={() => void action("reset-token")}>{t("connect.resetLink")}</Button><Button busy={busy === "share"} disabled={!!busy || !!operation} onClick={() => void action("share")}>{t("connect.copyShared")}</Button><Button disabled={!!busy || !!operation} onClick={() => void readMembers().catch(() => setError(t("connect.membersFailed")))}>{t("refresh")}</Button></div>
      {members.map(member => <Row key={member.id} title={<Status tone={member.online ? "success" : "neutral"}>{member.name}</Status>} description={t("connect.memberTimes", { joined: date(member.joinedAt), seen: date(member.lastOnline) })}><Button disabled={!!busy || !!operation} onClick={() => setConfirm(member)}>{t("remove")}</Button></Row>)}
    </>}
    {error && <Notice tone="danger">{error}</Notice>}
    {confirm && <Dialog title={t(typeof confirm === "string" ? `connect.confirm.${confirm}` : "connect.confirm.remove")} width={420} onClose={() => setConfirm(undefined)} busy={!!busy} footer={<><Button disabled={!!busy} onClick={() => setConfirm(undefined)}>{t("cancel")}</Button><Button variant="danger" busy={!!busy} onClick={() => void action(typeof confirm === "string" ? confirm : "remove", typeof confirm === "object" ? { instanceId: confirm.id } : {})}>{t("confirm")}</Button></>}><p>{t(confirm === "delete" ? "connect.deleteHint" : "connect.removeHint")}</p>{error && <Notice>{error}</Notice>}</Dialog>}
  </section>;
}

export default function RelayHostingSettings() {
  const relays = useRelays();
  if (!relays.relays.some(relay => relay.owner) && !relays.error) return null;
  return <Group title={t("source.relayHosting")}>
    {relays.relays.filter(relay => relay.owner).map(relay => <RelaySettings key={relay.id} hosting relay={relay} version={relays.version} refresh={relays.refresh} />)}
    {relays.error && <Notice>{t("connect.readFailed")}</Notice>}
  </Group>;
}
