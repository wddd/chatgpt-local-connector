import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { openOnboarding } from "../state/onboarding";
import { navigation } from "../state/navigation";
import { useRelayProgress, type Relay } from "../state/relay";
import RelayProgress from "./RelayProgress";
import { Button, CopyField, Dialog, Notice, Row, Status } from "./ui";
export function RelaySettings({ relay, version, refresh }: { relay: Relay; version: string; refresh: () => Promise<unknown> }) {
  const { status } = connector.use();
  const ingress = status?.ingresses.find(i => i.id === relay.ingressId);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [confirm, setConfirm] = useState<"leave">();
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
  async function action(name: string, extra = {}) {
    setBusy(name); setError("");
    try {
      const value = await api<import("../state/relay").RelayProgress>(`relay/${name}`, "POST", { id: relay.id, ...extra });
      if (value.jobId) { setProgress(value); setOperation(name); }
      if (name === "leave") { await refresh(); await refreshConnector(); }
      setConfirm(undefined); return true;
    } catch { setError(t("connect.actionFailed")); return false; }
    finally { setBusy(""); }
  }
  return <section className="relay-settings">
    <Row title={relay.name}>
      <Status tone={ingress?.state === "ready" ? "success" : "neutral"}>{t(ingress?.state === "ready" ? "connect.online" : "connect.offline")}</Status>
      {!relay.owner && <Button disabled={!!busy || !!operation} onClick={() => setConfirm("leave")}>{t("connect.leave")}</Button>}
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
    {error && <Notice tone="danger">{error}</Notice>}
    {confirm && <Dialog title={t("connect.confirm.leave")} width={420} onClose={() => setConfirm(undefined)} busy={!!busy} footer={<><Button disabled={!!busy} onClick={() => setConfirm(undefined)}>{t("cancel")}</Button><Button variant="danger" busy={!!busy} onClick={() => void action("leave")}>{t("confirm")}</Button></>}><p>{t("connect.removeHint")}</p>{error && <Notice>{error}</Notice>}</Dialog>}
  </section>;
}
