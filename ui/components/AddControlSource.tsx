import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../api";
import { controlSource, nextSourceName } from "../controlSources";
import { locale, t } from "../i18n";
import { openUrl } from "../platform";
import { connector, refreshConnector } from "../state/connector";
import { onboarding, openConnectionSetup, type OnboardingStep } from "../state/onboarding";
import { connectionKind } from "../sourcePresentation";
import SourceIcon from "./SourceIcon";
import { ApprovalCard } from "./OAuthApproval";
import { Button, CopyField, Field, HoverScope, Icon, Loading, Notice, SingleChoice, Status } from "./ui";

const steps: OnboardingStep[] = ["product", "connection", "address", "approval", "success"];
const products = ["claude", "chatgpt", "gemini", "grok", "grok-bot", "microsoft-copilot", "local-code", "local-desktop", "custom"];
export default function AddControlSource({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const flow = onboarding.use()!, { status, sources } = connector.use();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [route, setRoute] = useState("");
  const [credentials, setCredentials] = useState<{ ingressId: string; bearerToken: string }>();
  const product = flow.source ?? "custom", info = controlSource(product), name = info?.shortName ?? t("connect.other");
  const entries = status?.ingresses ?? [], current = entries.find(i => i.id === flow.ingressId);
  const existing = entries.filter(i => (i.auth === "oauth" || !sources.some(s => s.ingressId === i.id && (s.state === "revoked" || s.product !== product && (s.connectedAt !== null || s.lastSeenAt !== null)))) && (flow.localTarget ? i.transport === "local" && i.id === `local-claude-${flow.localTarget}` : i.transport !== "local" && (i.transport !== "openai-tunnel" || product === "chatgpt")))
    .sort((a, b) => Number(b.transport === "relay") - Number(a.transport === "relay"));
  const existingIds = existing.map(i => i.id).join(",");
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    setRoute(old => existing.some(i => i.id === flow.ingressId) ? flow.ingressId! : existing.some(i => i.id === old) ? old : existing[0]?.id ?? "");
  }, [flow.source, flow.localTarget, flow.ingressId, existingIds]);
  useEffect(() => {
    setCredentials(undefined);
    if (flow.step !== "address" || current?.auth !== "bearer") return;
    let alive = true;
    void api<{ bearerToken: string }>(`ingress/${current.id}/credentials`, "POST").then(value => {
      if (alive) setCredentials({ ingressId: current.id, bearerToken: value.bearerToken });
    }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [flow.step, current?.id, current?.auth]);
  function step(next: OnboardingStep) { setError(""); onboarding.set(old => old && { ...old, step: next, ...(["product", "connection"].includes(next) ? { requestId: undefined, ingressId: undefined, sourceId: undefined } : {}) }); }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function selectConnection(id: string) {
    await perform(async () => {
      const entry = connector.get().status?.ingresses.find(i => i.id === id);
      if (!entry) return;
      if (entry.auth !== "oauth") {
        const source = sources.find(s => s.ingressId === id && s.state !== "revoked");
        if (source && source.product !== product) {
          await api(`source/${source.id}`, "PUT", { product,
            ...(source.label === controlSource(source.product)?.displayName ? { label: nextSourceName(product, sources.filter(s => s.id !== source.id).map(s => s.label)) } : {}) });
          await refreshConnector();
        }
      }
      onboarding.set(old => old && { ...old, step: "address", ingressId: id, requestId: undefined, sourceId: undefined, baseline: (entry.oauth?.pending ?? []).map(p => p.id) });
    });
  }
  const pending = current?.oauth?.pending.filter(p => p.status === "pending") ?? [];
  const waiting = current?.oauth?.pending.find(p => p.id === flow.requestId);
  useEffect(() => {
    if (flow.step !== "address" || current?.auth !== "oauth") return;
    const next = pending.find(p => !flow.baseline?.includes(p.id));
    if (next) onboarding.set(old => old?.step === "address" ? { ...old, step: "approval", requestId: next.id } : old);
  }, [flow.step, flow.ingressId, current?.oauth]);
  const connected = sources.find(s => s.ingressId === current?.id && s.product === product && s.state === "connected" && s.connectedAt !== null && (current?.auth !== "oauth" || s.credential.grantId === flow.requestId));
  useEffect(() => {
    if (flow.step === "approval" && connected) onboarding.set(old => old?.step === "approval" ? { ...old, step: "success", sourceId: connected.id } : old);
  }, [flow.step, connected?.id]);
  function retry() {
    onboarding.set(old => old && { ...old, step: "address", requestId: undefined, baseline: (current?.oauth?.pending ?? []).map(p => p.id) });
  }
  const added = sources.find(s => s.id === flow.sourceId);
  const selectedProduct = flow.localTarget ? `local-${flow.localTarget}` : flow.source ?? "";
  return <div className="add-source-flow">
    <ol className="source-flow-progress" aria-label={t("addControlSource")}>{steps.map((value, index) => <li key={value} data-complete={steps.indexOf(flow.step) >= index || undefined} aria-current={flow.step === value ? "step" : undefined}>{t(`source.step.${value}`)}</li>)}</ol>
    {error && <Notice>{error}</Notice>}
    {flow.step === "product" && <>
      <HoverScope className="source-product-list"><SingleChoice navigation label={t("source.product")} value={selectedProduct} onChange={value => onboarding.set(old => old && { ...old, source: value.startsWith("local-") ? "claude" : value, localTarget: value.startsWith("local-") ? value.slice(6) as "code" | "desktop" : undefined, ingressId: undefined, requestId: undefined, sourceId: undefined })}
        options={products.map(id => ({ value: id, label: id === "custom" ? t("connect.other") : id === "local-code" ? "Claude Code" : id === "local-desktop" ? "Claude Desktop" : controlSource(id)!.displayName, graphic: <SourceIcon platform={id.startsWith("local-") ? "claude" : id} /> }))} /></HoverScope>
    </>}
    {flow.step === "connection" && <>
      {existing.length > 0 && <HoverScope><SingleChoice navigation label={t("source.connections")} value={route} onChange={setRoute} disabled={busy} options={existing.map(i => ({ value: i.id, label: i.name, description: `${t(`source.kind.${connectionKind(i)}`)} · ${t(i.state === "ready" ? "connect.online" : "connect.offline")}` }))} /></HoverScope>}
      <Button data-add-connection disabled={busy} onClick={() => openConnectionSetup({ forSource: true, product, localTarget: flow.localTarget })}>{t("source.newConnection")}</Button>
    </>}
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
      </> : <Notice tone="warning">{t("source.noOAuthApproval")}</Notice>}
    </div> : <Loading />)}
    {flow.step === "approval" && <>
      {current?.auth !== "oauth" ? <><Loading label={t("source.waitConnection")} /><Button onClick={() => step("address")}>{t("retry")}</Button></> : <>
        {pending.length > 1 && <SingleChoice label={t("source.pendingRequests")} value={flow.requestId ?? ""} onChange={requestId => onboarding.set(old => old && { ...old, requestId })} options={pending.map(p => ({ value: p.id, label: `${p.clientName} · ${p.pairingCode ?? p.redirectUri}` }))} />}
        {waiting ? <ApprovalCard key={waiting.id} request={waiting} ingress={current} product={product} inline /> : <Notice tone="warning">{t("connect.requestExpired")}</Notice>}
        {(!waiting || ["denied", "expired"].includes(waiting.status)) && <Button onClick={retry}>{t("retry")}</Button>}
      </>}
    </>}
    {flow.step === "success" && <Status tone="success">{t("source.added", { name: added?.label ?? name })}</Status>}
    <div className="source-flow-actions">
      {flow.step !== "product" && flow.step !== "success" && <Button variant="ghost" disabled={busy} onClick={() => step(steps[Math.max(0, steps.indexOf(flow.step) - 1)])}>{t("back")}</Button>}
      {flow.step === "product" && <Button variant="primary" disabled={!flow.source} onClick={() => step("connection")}>{t("source.next")}</Button>}
      {flow.step === "connection" && <Button variant="primary" busy={busy} disabled={!existing.some(i => i.id === route)} onClick={() => void selectConnection(route)}>{t("source.next")}</Button>}
      {flow.step === "address" && current && current.auth !== "oauth" && <Button variant="primary" disabled={busy} onClick={() => step("approval")}>{t("source.next")}</Button>}
      {flow.step === "success" && <Button variant="primary" onClick={() => onboarding.set(undefined)}>{t("source.done")}</Button>}
    </div>
  </div>;
}
