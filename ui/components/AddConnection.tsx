import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector, refreshConnector } from "../state/connector";
import type { ConnectionSetup } from "../state/onboarding";
import { useRelayProgress, type RelayProgress as Progress } from "../state/relay";
import IngressDialog from "./IngressDialog";
import RelayProgress from "./RelayProgress";
import { Button, Dialog, Field, HoverScope, Input, Loading, Notice, SingleChoice, Status } from "./ui";

type LocalAccess = { codeAvailable: boolean; desktopAvailable: boolean };
const steps = ["method", "address", "success"] as const;
export default function AddConnection({ options, onClose, onAdded }: { options: ConnectionSetup; onClose: () => void; onAdded: (id: string) => void }) {
  const { status, sources } = connector.use();
  const [step, setStep] = useState<typeof steps[number]>("method");
  const [method, setMethod] = useState(options.localTarget ? `local-${options.localTarget}` : options.method ?? "create");
  const [busy, setBusy] = useState(false), [configBusy, setConfigBusy] = useState(false), [error, setError] = useState("");
  const [link, setLink] = useState(""), [account, setAccount] = useState("");
  const [createdId, setCreatedId] = useState<string>();
  const [operation, setOperation] = useState<"create" | "join" | "redeploy">();
  const [local, setLocal] = useState<LocalAccess>();
  const formId = useId(), target = method === "local-code" ? "code" : method === "local-desktop" ? "desktop" : undefined;
  const created = status?.ingresses.find(i => i.id === createdId);
  const revoked = !!target && sources.some(s => s.ingressId === `local-claude-${target}` && s.state === "revoked");
  const { progress, setProgress, error: progressError } = useRelayProgress(!!operation, value => {
    if (!value.result?.ingressId) return;
    setOperation(undefined); complete(value.result.ingressId);
    void refreshConnector().catch(e => setError(String(e)));
  });
  useEffect(() => {
    let alive = true;
    void api<Progress>("relay/progress").then(value => {
      if (!alive || !["login", "deploying", "connecting"].includes(value.phase) || !["create", "join", "redeploy"].includes(value.action ?? "")) return;
      setProgress(value); setOperation(value.action as "create" | "join" | "redeploy"); setStep("address");
      setMethod(value.action === "join" ? "join" : "create");
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!target) return;
    let alive = true;
    void api<LocalAccess>("local-access/status").then(value => { if (alive) setLocal(value); }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [target]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError(String(e).includes("LOCAL_CONFIG_CONFLICT") ? t("connect.localConflict") : String(e)); }
    finally { setBusy(false); }
  }
  function complete(id: string) { setCreatedId(id); setStep("success"); }
  async function startRelay(retry = false) {
    const action = retry && progress.relayId && operation !== "join" ? "redeploy" : retry ? operation ?? "create" : method as "create" | "join";
    await perform(async () => {
      const value = await api<Progress>(`relay/${action}`, "POST", action === "join" ? { link: link.trim(), name: status?.deviceName || t("connect.thisComputer") } : { ...(retry && progress.relayId ? { id: progress.relayId } : {}), ...(account ? { accountId: account } : {}), name: status?.deviceName || t("connect.thisComputer") });
      setProgress(value); setOperation(action);
    });
  }
  async function configure() {
    if (!target) { await startRelay(); return; }
    await perform(async () => {
      const result = await api<{ ingressId: string }>("local-access/install", "POST", { target });
      complete(result.ingressId); await refreshConnector();
    });
  }
  const editing = step === "address" && !operation && ["https", "custom", "openai-tunnel"].includes(method);
  const configuring = step === "address" && !operation;
  return <Dialog title={t("source.newConnection")} width={560} headerless={editing} depthOffset={configuring ? 1 : 0} busy={busy || configBusy} onClose={configuring ? () => setStep("method") : onClose} onDismiss={onClose}>
    {editing ? <IngressDialog embedded connectionOnly initialProduct={method === "openai-tunnel" ? "chatgpt" : options.product ?? "custom"}
      initialTransport={method === "openai-tunnel" ? "openai-tunnel" : "https"} initialProvider={method === "custom" ? "custom" : undefined}
      onBusy={setConfigBusy} onClose={() => setStep("method")} onDismiss={onClose} onRemoved={onClose} onSaved={entry => {
        complete(entry.id);
        void perform(async () => { await api(`ingress/${entry.id}/start`, "POST"); await refreshConnector(); });
      }} /> : <div className="onboarding add-source-flow">
      <ol className="source-flow-progress connection-flow-progress" aria-label={t("source.newConnection")}>{steps.map((value, index) => <li key={value} data-complete={steps.indexOf(step) >= index || undefined} aria-current={step === value ? "step" : undefined}>{t(value === "method" ? "connectionMethod" : `source.step.${value}`)}</li>)}</ol>
      {error && <Notice>{error}</Notice>}
      {step === "method" && <HoverScope><SingleChoice navigation label={t("connectionMethod")} value={method} onChange={value => { setMethod(value); setError(""); }} options={options.localTarget
        ? [{ value: `local-${options.localTarget}`, label: options.localTarget === "code" ? "Claude Code" : "Claude Desktop" }]
        : [{ value: "create", label: t("source.createRelay") }, { value: "join", label: t("source.pasteRelay") }, { value: "https", label: t("source.kind.tunnel") }, { value: "custom", label: t("connect.customAddress") },
          ...(!options.product || options.product === "chatgpt" ? [{ value: "openai-tunnel", label: t("source.kind.openai") }] : []),
          ...(!options.product ? [{ value: "local-code", label: "Claude Code" }, { value: "local-desktop", label: "Claude Desktop" }] : [])]} /></HoverScope>}
      {step === "address" && (operation ? <>
        {progressError && <Notice>{t("connect.readFailed")}</Notice>}
        <RelayProgress progress={progress} busy={busy} account={account} setAccount={setAccount} onRetry={() => void startRelay(true)} onCancel={() => void perform(async () => { await api("relay/cancel", "POST"); setOperation(undefined); })} />
      </> : <form id={formId} onSubmit={e => { e.preventDefault(); void configure(); }}>
        {method === "join" && <Field id={`${formId}-link`} label={t("connect.sharedLink")}><Input id={`${formId}-link`} required type="url" value={link} onChange={e => setLink(e.target.value)} /></Field>}
        {method === "create" && <p>{t("connection.relayLogin")}</p>}
        {target && <>
          <p>{t("connection.localSetup", { name: target === "code" ? "Claude Code" : "Claude Desktop" })}</p>
          {!local && !error && <Loading />}
          {!local && error && <Button busy={busy} onClick={() => void perform(async () => setLocal(await api<LocalAccess>("local-access/status")))}>{t("retry")}</Button>}
          {local && !local[target === "code" ? "codeAvailable" : "desktopAvailable"] && <Notice tone="warning">{t("connect.unavailable")}</Notice>}
          {revoked && <Notice tone="warning">{t("source.revokedConnection")}</Notice>}
        </>}
      </form>)}
      {step === "success" && <>
        <Status tone="success">{t("connection.added")}</Status>
        {created && <strong>{created.name}</strong>}
        {target && <p>{t("connect.restartClaude")}</p>}
        {created?.error && <Notice>{created.error}</Notice>}
        {!created && <Button busy={busy} onClick={() => void perform(refreshConnector)}>{t("retry")}</Button>}
        {created && created.state !== "ready" && <Button busy={busy} onClick={() => void perform(async () => { await api(`ingress/${created.id}/start`, "POST"); await refreshConnector(); })}>{t("retry")}</Button>}
      </>}
      {!operation && <div className="source-flow-actions">
        {step === "address" && <Button disabled={busy} variant="ghost" onClick={() => { setError(""); setStep("method"); }}>{t("back")}</Button>}
        {step === "method" && <Button variant="primary" onClick={() => { setError(""); setStep("address"); }}>{t("source.next")}</Button>}
        {step === "address" && <Button type="submit" form={formId} variant="primary" busy={busy} disabled={!!target && (revoked || !local || !local[target === "code" ? "codeAvailable" : "desktopAvailable"])}>{t("source.next")}</Button>}
        {step === "success" && <Button variant="primary" disabled={busy || !created} onClick={() => createdId && onAdded(createdId)}>{t("source.done")}</Button>}
      </div>}
    </div>}
  </Dialog>;
}
