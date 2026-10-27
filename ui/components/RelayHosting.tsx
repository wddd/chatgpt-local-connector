import { TunnelCard } from "./objects/tunnel";
import { SettingRow, DangerZone, ActionGroup, SectionHeader, Button, Dialog, IconButton, Loading, Notice } from "./ui";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../api";
import { locale, t } from "../i18n";
import { copyText } from "../platform";
import { connector, notify, refreshConnector } from "../state/connector";
import { appNow, useAppNow } from "../state/appEnvironment";
import { useRelays, useRelayProgress, type Relay, type RelayProgress as Progress } from "../state/relay";
import { DeploymentProgressCard } from "./objects/deployment-progress";

import { RelayMemberCard, RelayMemberRow, type Member } from "./objects/relay-member";
type Job = { action: "create" | "redeploy" | "delete"; id?: string };
type Confirmation = "reset-token" | "delete" | Member;

function HostedRelay({ relay, version, startJob, disabled }: {
  relay: Relay; version: string; startJob: (job: Job) => Promise<boolean>; disabled: boolean;
}) {
  const { status, sources } = connector.use();
  const [members, setMembers] = useState<Member[]>([]), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [membersError, setMembersError] = useState("");
  const [confirm, setConfirm] = useState<Confirmation>();
  useAppNow(30_000);
  const ingress = status?.ingresses.find(value => value.id === relay.ingressId);
  const readMembers = useCallback(async () => {
    setLoading(true); setMembersError("");
    try { setMembers(relay.url ? await api<Member[]>("relay/instances", "POST", { id: relay.id }) : []); }
    catch { setMembersError(t("connect.membersFailed")); }
    finally { setLoading(false); }
  }, [relay.id, relay.url]);
  useEffect(() => { void readMembers(); }, [readMembers]);
  async function action(name: "share" | "reset-token" | "remove" | "delete", member?: Member) {
    if (name === "remove" && (!member || member.isSelf || !members.some(value => value.id === member.id))) return;
    setBusy(name); setError("");
    try {
      if (name === "delete") {
        if (!await startJob({ action: "delete", id: relay.id })) { setError(t("connect.actionFailed")); return; }
      } else {
        const result = await api<{ link?: string }>(`relay/${name}`, "POST", { id: relay.id, ...(member ? { instanceId: member.id } : {}) });
        if (name === "share" && result.link) { await copyText(result.link); notify(t("hosting.inviteCopied")); }
        if (name === "reset-token") notify(t("hosting.inviteReset"));
        if (name === "remove") await readMembers();
      }
      setConfirm(undefined);
    } catch { setError(t("connect.actionFailed")); }
    finally { setBusy(""); }
  }
  const blocked = disabled || !!busy;
  const outdated = !!version && relay.workerVersion !== version;
  return <article className="grid min-w-0 gap-6 [&+article]:border-t [&+article]:border-border [&+article]:pt-6" aria-label={t("hosting.title")}>
    <TunnelCard ingress={ingress} relay={relay} sources={sources} busy={blocked} headerActions={
      outdated || !relay.url ? <Button variant="ghost" disabled={blocked} onClick={() => void startJob({ action: "redeploy", id: relay.id })}>{t(outdated && relay.url ? "hosting.update" : "retry")}</Button> : undefined}>
      <SettingRow label={t("hosting.invite")} description={t("hosting.inviteDescription")}>
        <ActionGroup>
          <Button variant="primary" busy={busy === "share"} disabled={blocked || !relay.url} onClick={() => void action("share")}>{t("hosting.copyInvite")}</Button>
          <Button disabled={blocked || !relay.url} onClick={() => { setError(""); setConfirm("reset-token"); }}>{t("hosting.reset")}</Button>
        </ActionGroup>
      </SettingRow>
    </TunnelCard>
    <section className="grid min-w-0 gap-3">
      <SectionHeader level={3} title={<>{t("hosting.devices")}</>} secondary={<><p className="text-muted-foreground text-xs">{t("hosting.devicesDescription")}</p></>} actions={<><IconButton icon={RefreshCw} label={t("hosting.refreshDevices")} busy={loading} disabled={blocked || !relay.url} onClick={() => void readMembers()} /></>} />
      {membersError && <Notice tone="danger">{membersError}</Notice>}
      <div aria-busy={loading}>
        {!members.length && (loading ? <Loading /> : <p>{t(membersError ? 'connect.membersFailed' : 'hosting.noDevices')}</p>)}
        {members.map(member => <RelayMemberRow key={member.id} member={member} deviceName={status?.deviceName} now={appNow()} disabled={blocked} onRemove={() => { setError(''); setConfirm(member); }} />)}
      </div>
    </section>
    <DangerZone consequence={t("hosting.deleteDescription")}>
      <Button variant="danger-outline" disabled={blocked} onClick={() => { setError(""); setConfirm("delete"); }}>{t("hosting.delete")}</Button>
    </DangerZone>
    {error && !confirm && <Notice tone="danger">{error}</Notice>}
    {confirm && <Dialog title={t(confirm === "reset-token" ? "hosting.resetTitle" : confirm === "delete" ? "hosting.deleteTitle" : "connect.confirm.remove")} width={440} onClose={() => setConfirm(undefined)} busy={!!busy} footer={<>
      <Button disabled={!!busy} onClick={() => setConfirm(undefined)}>{t("cancel")}</Button>
      <Button variant={confirm === "reset-token" ? "primary" : "danger"} busy={!!busy} disabled={typeof confirm === "object" && (confirm.isSelf || !members.some(member => member.id === confirm.id))} onClick={() => void action(typeof confirm === "string" ? confirm : "remove", typeof confirm === "object" ? confirm : undefined)}>{t(confirm === "reset-token" ? "hosting.reset" : confirm === "delete" ? "delete" : "hosting.remove")}</Button>
    </>}>
      {typeof confirm === "object" && <RelayMemberCard member={confirm} deviceName={status?.deviceName} now={appNow()} />}
      {typeof confirm === "string" && <p>{t(confirm === "reset-token" ? "hosting.resetDescription" : "hosting.deleteDescription")}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Dialog>}
  </article>;
}

export default function RelayHosting() {
  locale.use();
  const relays = useRelays(), { status } = connector.use();
  const [job, setJob] = useState<Job>(), [deploy, setDeploy] = useState(false), [busy, setBusy] = useState(false);
  const [account, setAccount] = useState(""), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const { progress, setProgress, error: progressError } = useRelayProgress(!!job, () => {
    setJob(undefined); setDeploy(false); setAccount(""); setRevision(value => value + 1);
    void relays.refresh().catch(() => {}); void refreshConnector().catch(() => {});
  });
  useEffect(() => {
    let alive = true;
    void api<Progress>("relay/progress").then(value => {
      if (alive && ["create", "redeploy", "delete"].includes(value.action ?? "") && ["login", "deploying", "connecting", "failed"].includes(value.phase) && !value.cancelled) {
        setProgress(value); setJob({ action: value.action as Job["action"], id: value.relayId });
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [setProgress]);
  async function startJob(next: Job) {
    setBusy(true); setError("");
    try {
      const value = await api<Progress>(`relay/${next.action}`, "POST", { ...(next.id ? { id: next.id } : {}), ...(next.action === "create" ? { name: status?.deviceName || t("connect.thisComputer") } : {}), ...(next.action !== "delete" && account ? { accountId: account } : {}) });
      setProgress(value); setJob(next); setDeploy(false); return true;
    } catch { setError(t("connect.actionFailed")); return false; }
    finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try { await api("relay/cancel", "POST"); setJob(undefined); setDeploy(false); setAccount(""); await relays.refresh(); await refreshConnector(); }
    catch { setError(t("connect.actionFailed")); }
    finally { setBusy(false); }
  }
  const owners = relays.relays.filter(relay => relay.owner);
  return <div className="grid min-w-0 gap-6">
    <SectionHeader level={2} title={<>{t("hosting.title")}</>} actions={<><Button disabled={busy || !!job} onClick={() => { setError(""); setAccount(""); setDeploy(true); }}>{t("hosting.deploy")}</Button></>} />
    {!relays.loaded ? <Loading /> : !owners.length && !relays.error && <p className="text-muted-foreground">{t("hosting.empty")}</p>}
    {relays.error && <Notice tone="danger" action={<Button onClick={() => void relays.refresh().catch(() => {})}>{t("retry")}</Button>}>{t("connect.readFailed")}</Notice>}
    {error && !deploy && !job && <Notice tone="danger">{error}</Notice>}
    {owners.map(relay => <HostedRelay key={`${relay.id}:${revision}`} relay={relay} version={relays.version} startJob={startJob} disabled={busy || !!job} />)}
    {(deploy || job) && <Dialog title={t(job?.action === "delete" ? "hosting.deleteTitle" : job?.action === "redeploy" ? "connect.updateRelay" : "hosting.deploy")} width={440} busy={busy || !!job && progress.phase !== "failed"} onClose={() => { setDeploy(false); setJob(undefined); setError(""); }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {progressError && job && <Notice tone="danger">{t("connect.readFailed")}</Notice>}
      {job ? <DeploymentProgressCard progress={progress} busy={busy} account={account} setAccount={setAccount} onCancel={() => void cancel()} onRetry={() => void startJob({ action: job.action === "create" && progress.relayId ? "redeploy" : job.action, id: progress.relayId ?? job.id })} /> : <form onSubmit={event => { event.preventDefault(); void startJob({ action: "create" }); }}>
        <p className="text-muted-foreground">{t("connect.freeAccount")}</p>
        <ActionGroup><Button type="submit" variant="primary" busy={busy}>{t("hosting.deploy")}</Button></ActionGroup>
      </form>}
    </Dialog>}
  </div>;
}
