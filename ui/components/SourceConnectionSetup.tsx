import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import { type ConnectionSetup } from "../state/onboarding";
import { useRelayProgress, type RelayProgress } from "../state/relay";
import { DeploymentProgressCard } from "./objects/deployment-progress";
import { TunnelCard } from "./objects/tunnel";
import { Button, Dialog, Loading, Notice } from "./ui";

// Phase 3 replaces the nested Add SRC connection step with automatic binding.
// Keep only public relay deployment and the existing local client installer.
export default function SourceConnectionSetup({ options, onClose, onAdded }: {
  options: ConnectionSetup; onClose: () => void; onAdded: (id: string) => void;
}) {
  const { status, sources } = connector.use();
  const target = options.localTarget;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [account, setAccount] = useState(""), [active, setActive] = useState(false);
  const [createdId, setCreatedId] = useState<string>();
  const started = useRef(false);
  const { progress, setProgress, error: progressError } = useRelayProgress(active, value => {
    setActive(false); setCreatedId(value.result?.ingressId);
    void refreshConnector().catch(e => setError(String(e)));
  });
  async function refreshCreated() {
    setBusy(true); setError("");
    try { await refreshConnector(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function start(retry = false) {
    setBusy(true); setError("");
    try {
      if (target) {
        const result = await api<{ ingressId: string }>("local-access/install", "POST", { target });
        setCreatedId(result.ingressId); await refreshConnector();
      } else {
        const value = await api<RelayProgress>(`relay/${retry && progress.relayId ? "redeploy" : "create"}`, "POST", {
          ...(retry && progress.relayId ? { id: progress.relayId } : {}),
          ...(account ? { accountId: account } : {}), name: status?.deviceName || t("connect.thisComputer"),
        });
        setProgress(value); setActive(true);
      }
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (target || started.current) return;
    started.current = true;
    let alive = true;
    void api<RelayProgress>("relay/progress").then(value => {
      if (!alive) return;
      if (["login", "deploying", "connecting"].includes(value.phase)) {
        if (!["create", "redeploy"].includes(value.action ?? "")) { setError(t("connect.inProgress")); return; }
        setProgress(value); setActive(true);
      } else void start();
    }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, []);
  const created = status?.ingresses.find(entry => entry.id === createdId);
  return <Dialog centered title={t(target ? "addControlSource" : "source.createRelay")} busy={busy} onClose={onClose}
    footer={createdId ? <Button variant="primary" disabled={!created || busy} onClick={() => onAdded(createdId)}>{t(options.forSource ? "source.next" : "source.done")}</Button> : undefined}>
    {(error || progressError) && <Notice>{error || progressError}</Notice>}
    {created ? <TunnelCard ingress={created} sources={sources} /> : createdId ? <Button busy={busy} onClick={() => void refreshCreated()}>{t("retry")}</Button> : target ? <>
      <p>{t("connection.localSetup", { name: target === "code" ? "Claude Code" : t("setup.claudeDesktop") })}</p>
      <Button variant="primary" busy={busy} onClick={() => void start()}>{t("source.next")}</Button>
    </> : active || progress.phase === "failed" ? <DeploymentProgressCard progress={progress} busy={busy} account={account} setAccount={setAccount}
      onRetry={() => void start(true)} onCancel={() => {
        setBusy(true); void api("relay/cancel", "POST").then(() => { setActive(false); onClose(); }).catch(e => setError(String(e))).finally(() => setBusy(false));
      }} /> : busy ? <Loading /> : error ? <Button onClick={() => void start()}>{t("retry")}</Button> : null}
  </Dialog>;
}
