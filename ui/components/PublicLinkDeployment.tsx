import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { rememberPublicRelay, useRelayProgress, type RelayProgress } from "../state/relay";
import { DeploymentProgressCard } from "./objects/deployment-progress";
import { Button, Loading, Notice } from "./ui";

// Both basic setup surfaces share the existing deployment job and its identity.
export default function PublicLinkDeployment({ relayId, onReady, onCancel }: {
  relayId?: string; onReady: (id: string) => void; onCancel: () => void;
}) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [account, setAccount] = useState(""), [active, setActive] = useState(false);
  const [result, setResult] = useState<RelayProgress>();
  const { progress, setProgress, error: progressError } = useRelayProgress(active, value => {
    setActive(false); setResult(value); void complete(value);
  });
  async function complete(value: RelayProgress) {
    setBusy(true); setError("");
    try {
      const id = value.result?.ingressId;
      if (!id) throw new Error("Public link deployment returned no ingress ID. Read relay.list through CLI.");
      await rememberPublicRelay(value.result?.relayId ?? value.relayId ?? relayId ?? "");
      await refreshConnector();
      if (!connector.get().status?.ingresses.some(entry => entry.id === id)) throw new Error("Public link is not present in status yet. Retry the status read.");
      if (mounted.current) onReady(id);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function start(previous?: RelayProgress) {
    setBusy(true); setError(""); setActive(false);
    try {
      const id = previous?.relayId ?? relayId;
      const value = await api<RelayProgress>(`relay/${id ? "redeploy" : "create"}`, "POST", {
        ...(id ? { id } : {}), ...(account ? { accountId: account } : {}),
        ...(!id ? { name: connector.get().status?.deviceName || t("connect.thisComputer") } : {}),
      });
      if (mounted.current) { setProgress(value); setActive(true); }
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  useEffect(() => {
    let alive = true;
    void api<RelayProgress>("relay/progress").then(value => {
      if (!alive) return;
      if (["login", "deploying", "connecting"].includes(value.phase)) {
        if (!["create", "redeploy"].includes(value.action ?? "") || relayId && value.relayId && relayId !== value.relayId) { setError(t("connect.inProgress")); return; }
        setProgress(value); setActive(true);
      } else if (value.phase === "failed" && ["create", "redeploy"].includes(value.action ?? "") && (!relayId || value.relayId === relayId)) {
        setProgress(value);
      } else void start();
    }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, []);
  async function cancel() {
    setBusy(true); setError("");
    try { await api("relay/cancel", "POST"); setActive(false); await refreshConnector(); onCancel(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <>
    {(error || progressError) && <Notice>{error || progressError}</Notice>}
    {result ? <Button busy={busy} onClick={() => void complete(result)}>{t("retry")}</Button>
      : active || progress.phase === "failed" ? <DeploymentProgressCard progress={progress} busy={busy} account={account} setAccount={setAccount} onRetry={() => void start(progress)} onCancel={() => void cancel()} />
      : busy ? <Loading /> : error ? <Button onClick={() => void start(progress)}>{t("retry")}</Button> : <Loading />}
  </>;
}
