import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../api";
import { controlSource } from "../controlSources";
import { locale, t } from "../i18n";
import { openUrl } from "../platform";
import { connector, refreshConnector } from "../state/connector";
import { onboarding, type OnboardingStep } from "../state/onboarding";
import { useRelays, useRelayProgress, type RelayProgress as RelayProgressState } from "../state/relay";
import { useSetup } from "../state/setup";
import { connectionKind } from "../sourcePresentation";
import SourceIcon from "./SourceIcon";
import IngressDialog from "./IngressDialog";
import SetupDialog from "./SetupDialog";
import RelayProgress from "./RelayProgress";
import { ApprovalCard } from "./OAuthApproval";
import { Button, CopyField, Field, Icon, Input, Loading, Notice, SingleChoice, Status } from "./ui";

const steps: OnboardingStep[] = ["product", "connection", "address", "approval"];
const products = ["claude", "chatgpt", "gemini", "grok", "grok-bot", "microsoft-copilot", "local-code", "local-desktop", "custom"];
type LocalAccess = { codeAvailable: boolean; desktopAvailable: boolean; codeInstalled: boolean; desktopInstalled: boolean };
export default function AddControlSource({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const flow = onboarding.use()!, { status, sources } = connector.use();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [route, setRoute] = useState(""), [link, setLink] = useState(""), [account, setAccount] = useState("");
  const [operation, setOperation] = useState<"create" | "join" | "redeploy">();
  const [editor, setEditor] = useState<"https" | "openai-tunnel" | "custom">();
  const [agentMode, setAgentMode] = useState<"entry" | "progress" | null>(null);
  const [credentials, setCredentials] = useState<{ ingressId: string; bearerToken: string }>();
  const [local, setLocal] = useState<LocalAccess>();
  const relays = useRelays(), setup = useSetup(!!agentMode);
  const product = flow.source ?? "custom", info = controlSource(product), name = info?.shortName ?? t("connect.other");
  const entries = status?.ingresses ?? [], current = entries.find(i => i.id === flow.ingressId);
  const existing = entries.filter(i => (i.auth === "oauth" || !sources.some(s => s.ingressId === i.id && (s.product !== product || s.state === "revoked"))) && (flow.localTarget ? i.transport === "local" && i.id === `local-claude-${flow.localTarget}` : i.transport !== "local" && (i.transport !== "openai-tunnel" || product === "chatgpt")))
    .sort((a, b) => Number(b.transport === "relay") - Number(a.transport === "relay"));
  const localRevoked = !!flow.localTarget && sources.some(s => s.ingressId === `local-claude-${flow.localTarget}` && s.state === "revoked");
  const recommended = existing.find(i => i.transport === "relay");
  const { progress, setProgress, error: progressError } = useRelayProgress(!!operation, value => {
    if (!value.result?.ingressId) return;
    setOperation(undefined); selectConnection(value.result.ingressId);
    void refreshConnector().catch(e => setError(String(e))); void relays.refresh().catch(() => {});
  });
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    let alive = true;
    void api<RelayProgressState>("relay/progress").then(value => {
      if (alive && ["login", "deploying", "connecting"].includes(value.phase) && ["create", "join", "redeploy"].includes(value.action ?? "")) {
        setProgress(value); setOperation(value.action as "create" | "join" | "redeploy"); step("connection");
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    setRoute(flow.localTarget ? "local" : flow.method ?? (recommended ? `existing:${recommended.id}` : existing[0] ? `existing:${existing[0].id}` : "create"));
  }, [flow.source, flow.localTarget, flow.method, existing.map(i => i.id).join(",")]);
  useEffect(() => {
    if (!flow.localTarget) return;
    let alive = true;
    void api<LocalAccess>("local-access/status").then(value => { if (alive) setLocal(value); }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [flow.localTarget]);
  useEffect(() => {
    setCredentials(undefined);
    if (flow.step !== "address" || current?.auth !== "bearer") return;
    let alive = true;
    void api<{ bearerToken: string }>(`ingress/${current.id}/credentials`, "POST").then(value => {
      if (alive) setCredentials({ ingressId: current.id, bearerToken: value.bearerToken });
    }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [flow.step, current?.id, current?.auth]);
  function step(next: OnboardingStep) { setError(""); onboarding.set(old => old && { ...old, step: next, ...(["product", "connection"].includes(next) ? { requestId: undefined, ingressId: undefined } : {}) }); }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(String(e).includes("LOCAL_CONFIG_CONFLICT") ? t("connect.localConflict") : String(e)); }
    finally { setBusy(false); }
  }
  function selectConnection(id: string) {
    const entry = connector.get().status?.ingresses.find(i => i.id === id);
    onboarding.set(old => old && { ...old, step: "address", ingressId: id, requestId: undefined, baseline: (entry?.oauth?.pending ?? []).map(p => p.id) });
  }
  async function startRelay(retry = false) {
    const action = retry && progress.relayId && operation !== "join" ? "redeploy" : retry ? operation ?? "create" : route as "create" | "join";
    await perform(async () => {
      const value = await api<RelayProgressState>(`relay/${action}`, "POST", action === "join" ? { link: link.trim(), name: status?.deviceName || t("connect.thisComputer") } : { ...(retry && progress.relayId ? { id: progress.relayId } : {}), ...(account ? { accountId: account } : {}), name: status?.deviceName || t("connect.thisComputer") });
      setProgress(value); setOperation(action);
    });
  }
  async function chooseConnection() {
    if (route.startsWith("existing:")) { selectConnection(route.slice(9)); return; }
    if (["https", "openai-tunnel"].includes(route)) { setEditor(route as "https" | "openai-tunnel"); return; }
    if (route === "local") {
      await perform(async () => {
        const result = await api<{ ingressId: string }>("local-access/install", "POST", { target: flow.localTarget });
        await refreshConnector(); selectConnection(result.ingressId);
      });
      return;
    }
    await startRelay();
  }
  const pending = current?.oauth?.pending.filter(p => p.status === "pending") ?? [];
  const waiting = current?.oauth?.pending.find(p => p.id === flow.requestId);
  useEffect(() => {
    if (flow.step !== "address" || current?.auth !== "oauth") return;
    const next = pending.find(p => !flow.baseline?.includes(p.id));
    if (next) onboarding.set(old => old?.step === "address" ? { ...old, step: "approval", requestId: next.id } : old);
  }, [flow.step, flow.ingressId, current?.oauth]);
  const connected = sources.find(s => s.ingressId === current?.id && s.state === "connected" && (current?.auth !== "oauth" || s.credential.grantId === flow.requestId));
  function retry() {
    onboarding.set(old => old && { ...old, step: "address", requestId: undefined, baseline: (current?.oauth?.pending ?? []).map(p => p.id) });
  }
  const selectedProduct = flow.localTarget ? `local-${flow.localTarget}` : flow.source ?? "";
  return <div className="add-source-flow">
    <ol className="source-flow-progress" aria-label={t("addControlSource")}>{steps.map((value, index) => <li key={value} data-complete={steps.indexOf(flow.step) >= index || undefined} aria-current={flow.step === value ? "step" : undefined}>{t(`source.step.${value}`)}</li>)}</ol>
    {error && <Notice>{error}</Notice>}
    {flow.step === "product" && <>
      <div className="source-grid"><SingleChoice cards label={t("source.product")} value={selectedProduct} onChange={value => onboarding.set(old => old && { ...old, source: value.startsWith("local-") ? "claude" : value, localTarget: value.startsWith("local-") ? value.slice(6) as "code" | "desktop" : undefined, ingressId: undefined, requestId: undefined })}
        options={products.map(id => ({ value: id, label: id === "custom" ? t("connect.other") : id === "local-code" ? "Claude Code" : id === "local-desktop" ? "Claude Desktop" : controlSource(id)!.displayName, graphic: <SourceIcon platform={id.startsWith("local-") ? "claude" : id} /> }))} /></div>
      <Button variant="primary" disabled={!flow.source} onClick={() => step("connection")}>{t("source.next")}</Button>
    </>}
    {flow.step === "connection" && (operation ? <>
      {progressError && <Notice>{t("connect.readFailed")}</Notice>}
      <RelayProgress progress={progress} busy={busy} account={account} setAccount={setAccount} onRetry={() => void startRelay(true)} onCancel={() => void perform(async () => { await api("relay/cancel", "POST"); setOperation(undefined); })} />
    </> : <form onSubmit={e => { e.preventDefault(); void chooseConnection(); }}>
      <SingleChoice cards label={t("source.connections")} value={route} onChange={setRoute} disabled={busy} options={[
        ...existing.map(i => ({ value: `existing:${i.id}`, label: i.name, description: i.id === recommended?.id ? t("source.recommendedRelay") : `${t(`source.kind.${connectionKind(i)}`)} · ${t(i.state === "ready" ? "connect.online" : "connect.offline")}` })),
        ...(!flow.localTarget ? [{ value: "create", label: t("source.createRelay") }, { value: "join", label: t("source.pasteRelay") }, { value: "https", label: t("source.kind.tunnel") }, ...(product === "chatgpt" ? [{ value: "openai-tunnel", label: t("source.kind.openai") }] : [])] : [{ value: "local", label: t("source.kind.local") }]),
      ]} />
      {route === "join" && <Field id="source-relay-link" label={t("connect.sharedLink")}><Input id="source-relay-link" required type="url" value={link} onChange={e => setLink(e.target.value)} /></Field>}
      {route === "create" && <p className="muted small">{t("connect.freeAccount")}</p>}
      {localRevoked && <Notice tone="warning">{t("source.revokedConnection")}</Notice>}
      {flow.localTarget && local && !local[flow.localTarget === "code" ? "codeAvailable" : "desktopAvailable"] && <Notice tone="warning">{t("connect.unavailable")}</Notice>}
      <Button type="submit" variant="primary" busy={busy} disabled={!route || route === "local" && (localRevoked || !local || !local[flow.localTarget === "code" ? "codeAvailable" : "desktopAvailable"])}>{t("source.next")}</Button>
      <details><summary>{t("connect.advanced")}</summary><div className="actions"><Button onClick={() => setEditor("custom")}>{t("connect.customAddress")}</Button><Button onClick={() => setAgentMode("entry")}>{t("setup.sendCodex")}</Button></div></details>
    </form>)}
    {flow.step === "address" && (current ? <div className="connection-steps">
      {current.transport === "local" ? <p>{t("connect.restartClaude")}</p> : <>
        <CopyField value={current.url || current.config.tunnelId} label={t("source.copyAddress")} />
        {credentials?.ingressId === current.id && <Field label={t("source.bearerHeader")}><CopyField password value={`Bearer ${credentials.bearerToken}`} label={t("source.bearerHeader")} /></Field>}
        <p>{info?.setup?.path[locale.get()] ?? t("connect.customPath")}</p>
        {info?.setup?.url && <Button onClick={() => void perform(() => openUrl(info.setup!.url))}>{t("connect.openSettings", { name })}<Icon icon={ExternalLink} /></Button>}
      </>}
      {current.error && <Notice>{current.error}</Notice>}
      {current.state !== "ready" && <Button busy={busy} onClick={() => void perform(async () => { await api(`ingress/${current.id}/start`, "POST"); await refreshConnector(); })}>{t("retry")}</Button>}
      {current.auth === "oauth" ? <>
        <Loading label={t("connect.waitClient", { name })} />
        {pending.length > 0 && <Button onClick={() => onboarding.set(old => old && { ...old, step: "approval", requestId: pending[0].id })}>{t("source.review")}</Button>}
      </> : <><Notice tone="warning">{t("source.noOAuthApproval")}</Notice><Button variant="primary" onClick={() => step("approval")}>{t("source.next")}</Button></>}
    </div> : <Loading />)}
    {flow.step === "approval" && <>
      {connected ? <><Status tone="success">{t("connect.connected", { name: connected.label })}</Status><Button variant="primary" onClick={() => onboarding.set(undefined)}>{t("source.done")}</Button></> : current?.auth !== "oauth" ? <><Loading label={t("source.waitConnection")} /><Button onClick={() => step("address")}>{t("retry")}</Button></> : <>
        {pending.length > 1 && <SingleChoice label={t("source.pendingRequests")} value={flow.requestId ?? ""} onChange={requestId => onboarding.set(old => old && { ...old, requestId })} options={pending.map(p => ({ value: p.id, label: `${p.clientName} · ${p.pairingCode ?? p.redirectUri}` }))} />}
        {waiting ? <ApprovalCard key={waiting.id} request={waiting} ingress={current} product={product} inline /> : <Notice tone="warning">{t("connect.requestExpired")}</Notice>}
        {(!waiting || ["denied", "expired"].includes(waiting.status)) && <Button onClick={retry}>{t("retry")}</Button>}
      </>}
    </>}
    {flow.step !== "product" && !operation && <Button variant="ghost" disabled={busy} onClick={() => step(steps[Math.max(0, steps.indexOf(flow.step) - 1)])}>{t("back")}</Button>}
    {editor && <IngressDialog initialProduct={product} initialTransport={editor === "openai-tunnel" ? "openai-tunnel" : "https"} initialProvider={editor === "custom" ? "custom" : undefined} onClose={() => setEditor(undefined)} onRemoved={() => setEditor(undefined)} onSaved={entry => {
      setEditor(undefined); selectConnection(entry.id);
      void perform(async () => { await api(`ingress/${entry.id}/start`, "POST"); await refreshConnector(); });
    }} />}
    {agentMode && <SetupDialog mode={agentMode} setMode={setAgentMode} snapshot={setup.snapshot} error={setup.error} refresh={setup.refresh} onClose={() => setAgentMode(null)} onManual={() => { setAgentMode(null); setEditor("custom"); }} />}
  </div>;
}
