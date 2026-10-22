import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../api";
import { locale, t } from "../i18n";
import { copyText, openUrl } from "../platform";
import { controlSource } from "../controlSources";
import { connector, notify, refreshConnector } from "../state/connector";
import { onboarding, openOnboarding, remoteIngress, sourceForClient, sourceLabels } from "../state/onboarding";
import { permissions, permissionsReady } from "../state/permissions";
import { navigation } from "../state/navigation";
import { useRelayProgress, useRelays } from "../state/relay";
import type { SurfaceRect } from "../motion/surface";
import type { Login } from "../state/types";
import SourceIcon from "./SourceIcon";
import { ApprovalCard } from "./OAuthApproval";
import RelayProgress from "./RelayProgress";
import { Button, CopyField, Dialog, Field, Icon, Input, Loading, Notice, Row, SingleChoice, Status } from "./ui";

type LocalAccess = { codeAvailable: boolean; desktopAvailable: boolean; codeInstalled: boolean; desktopInstalled: boolean };
export default function Onboarding({ onAdvanced, onPanelFrame }: { onAdvanced: () => void; onPanelFrame: (rect: SurfaceRect | null) => void }) {
  const flow = onboarding.use()!, { status } = connector.use(); permissions.use();
  const [mode, setMode] = useState<string>(flow.method ?? "create"), [link, setLink] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [login, setLogin] = useState("loading"), [local, setLocal] = useState<LocalAccess>();
  const [localTarget, setLocalTarget] = useState<"code" | "desktop">("code");
  const [copied, setCopied] = useState(false), [account, setAccount] = useState("");
  const relay = useRelays();
  const current = status?.ingresses.find(i => i.id === flow.ingressId) ?? remoteIngress(status?.ingresses);
  const source = controlSource(flow.source ?? ""), name = source?.shortName ?? t("connect.other");
  const { progress, setProgress, error: progressError } = useRelayProgress(flow.step === "progress", value => {
    if (!value.result?.ingressId) return;
    onboarding.set(old => old?.step === "progress" ? { ...old, step: "ready", ingressId: value.result!.ingressId } : old);
    void refreshConnector().catch(() => setError(t("connect.readFailed")));
    void relay.refresh().catch(() => {});
  });
  useEffect(() => {
    let alive = true;
    void api<import("../state/relay").RelayProgress>("relay/progress").then(value => {
      if (alive && ["login", "deploying", "connecting"].includes(value.phase) && value.action !== "delete") {
        setProgress(value); setMode(value.action === "join" ? "join" : "create");
        onboarding.set(old => old && { ...old, step: "progress" });
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(t(String(e).includes("LOCAL_CONFIG_CONFLICT") ? "connect.localConflict" : "connect.actionFailed")); }
    finally { setBusy(false); }
  }
  function step(next: typeof flow.step) { setError(""); onboarding.set(old => old && { ...old, step: next }); }
  async function installLocal(target: "code" | "desktop") {
    setLocalTarget(target);
    await api("local-access/install", "POST", { target });
    setLocal(await api<LocalAccess>("local-access/status"));
    await refreshConnector();
  }
  useEffect(() => {
    if (flow.step !== "welcome") return;
    const read = () => { void api<Login>("codex/login").then(v => setLogin(v.state)).catch(() => setLogin("unavailable")); };
    read(); window.addEventListener("focus", read); return () => window.removeEventListener("focus", read);
  }, [flow.step]);
  useEffect(() => {
    if (flow.step !== "local") return;
    let alive = true;
    void perform(async () => {
      let value = await api<LocalAccess>("local-access/status");
      if (alive) setLocal(value);
      if (value.codeAvailable && !value.codeInstalled) {
        setLocalTarget("code");
        await api("local-access/install", "POST", { target: "code" });
        value = await api<LocalAccess>("local-access/status"); await refreshConnector();
      }
      if (alive) setLocal(value);
    });
    return () => { alive = false; };
  }, [flow.step]);
  async function startRelay(retry = false) {
    await perform(async () => {
      if (mode === "custom") { onAdvanced(); return; }
      if (mode === "join" && !link.trim()) { step("remote"); return; }
      const action = retry && progress.relayId ? mode === "join" ? "join" : "redeploy" : mode;
      const value = await api<import("../state/relay").RelayProgress>(`relay/${action}`, "POST", action === "join" ? { link: link.trim(), name: status?.deviceName || t("connect.thisComputer") } : { ...(progress.relayId && retry ? { id: progress.relayId } : {}), ...(account ? { accountId: account } : {}), name: status?.deviceName || t("connect.thisComputer") });
      setProgress(value); step("progress");
    });
  }
  async function selectSource(id: string) {
    const entry = remoteIngress(status?.ingresses);
    setCopied(false); setError("");
    const baseline = [...(entry?.oauth?.pending ?? []), ...(entry?.oauth?.grants ?? [])].map(p => p.id);
    onboarding.set({ step: entry ? "connect" : "remote", source: id, ingressId: entry?.id, baseline });
    if (entry) { try { await copyText(entry.url); setCopied(true); } catch { /* Keep the manual copy control available. */ } }
  }
  const waiting = current?.oauth?.pending.find(p => p.id === flow.requestId)
    ?? current?.oauth?.pending.find(p => !flow.baseline?.includes(p.id) && p.status === "pending" && (flow.source === "custom" || sourceForClient(p.clientName) === flow.source));
  useEffect(() => {
    if (flow.step === "connect" && waiting && !flow.requestId) onboarding.set(old => old && { ...old, requestId: waiting.id });
  }, [flow.step, waiting?.id, flow.requestId]);
  const completed = useRef(false);
  useEffect(() => {
    if (flow.step !== "connect" || !flow.requestId || completed.current || !current?.oauth?.grants.some(g => g.id === flow.requestId)) return;
    completed.current = true;
    sourceLabels.set(old => ({ ...old, [flow.requestId!]: flow.source! }));
    notify(t("connect.connected", { name }) + " " + t("connect.tryPrompt"), false, t("connect.tryPrompt"));
    onboarding.set(undefined);
  }, [current?.oauth, flow.requestId, flow.step]);
  const title = flow.step === "connect" ? name : t(`connect.title.${flow.step}`);
  return <Dialog title={title} leading={flow.step === "welcome" ? <img className="welcome-logo" src={new URL("../assets/arc/mark.svg", import.meta.url).href} alt="ARC" /> : undefined} dock="left" width={440} onPanelFrame={onPanelFrame} returnFocus=".hub-source" onClose={() => onboarding.set(undefined)} busy={busy}>
    <div className="onboarding side-panel-scroll">
      {error && <Notice tone="danger">{error}</Notice>}
      {flow.step === "welcome" && <>
        <p className="muted">{t("connect.welcomeSubtitle")}</p>
        <div className="welcome-choices">{["local", "remote"].map(value => <Button key={value} className="welcome-card" onClick={() => step(value as "local" | "remote")}>
          <strong>{t(`connect.${value}Title`)}</strong><span>{t(`connect.${value}Clients`)}</span><small>{t(`connect.${value}Time`)}</small>
        </Button>)}</div>
        <div className="welcome-status"><Button variant="ghost" disabled={login === "authenticated" || busy} onClick={() => void perform(async () => { await api("codex/login", "POST"); setLogin((await api<Login>("codex/login")).state); })}><Status tone={login === "authenticated" ? "success" : "warning"}>{t(login === "authenticated" ? "connect.codexReady" : "connect.codexFix")}</Status></Button>
          <Button variant="ghost" onClick={() => navigation.set(old => ({ ...old, page: "permissions" }))}><Status tone={permissionsReady(status?.ingresses ?? []) ? "success" : "warning"}>{t(permissionsReady(status?.ingresses ?? []) ? "connect.permissionsReady" : "connect.permissionsFix")}</Status></Button></div>
        <Button variant="ghost" onClick={() => { setMode("join"); step("remote"); }}>{t("connect.haveLink")}</Button>
      </>}
      {flow.step === "local" && <>
        <Row title={t("connect.claudeDesktop")} description={t("connect.restartClaude")}><Button disabled={busy || !local?.desktopAvailable || local.desktopInstalled} onClick={() => void perform(() => installLocal("desktop"))}>{t(local?.desktopInstalled ? "connect.added" : local && !local.desktopAvailable ? "connect.unavailable" : "connect.installExtension")}</Button></Row>
        <Row title="Claude Code"><span>{t(local?.codeInstalled ? "connect.added" : busy ? "connect.adding" : "connect.notInstalled")}</span></Row>
        {error && <Button onClick={() => void perform(() => installLocal(localTarget))}>{t("retry")}</Button>}
        <section className="try-card"><strong>{t("connect.tryClaude")}</strong><CopyField value={t("connect.tryPrompt")} label={t("copy")} /></section>
        <Button variant="ghost" onClick={() => step("remote")}>{t("connect.enableAway")}</Button>
      </>}
      {flow.step === "remote" && <>
        <p className="muted">{t("connect.remoteSubtitle")}</p>
        <form onSubmit={e => { e.preventDefault(); void startRelay(); }}>
          <SingleChoice cards label={t("connect.remoteMethod")} value={mode} onChange={setMode} disabled={busy} options={["create", "join", "custom"].map(value => ({ value, label: t(`connect.method.${value}`), description: t(`connect.method.${value}Hint`) }))} />
          {mode === "join" && <Field id="shared-link" label={t("connect.sharedLink")}><Input id="shared-link" required type="url" value={link} onChange={e => setLink(e.target.value)} /></Field>}
          {mode === "create" && <p className="muted small">{t("connect.freeAccount")}</p>}
          <Button type="submit" variant="primary" busy={busy}>{t(`connect.start.${mode}`)}</Button>
        </form>
      </>}
      {flow.step === "progress" && <>
        {progressError && <Notice>{t("connect.readFailed")}</Notice>}
        <RelayProgress progress={progress} busy={busy} account={account} setAccount={setAccount} onRetry={() => void startRelay(true)} onCancel={() => void perform(async () => { await api("relay/cancel", "POST"); step("remote"); })} />
      </>}
      {flow.step === "ready" && <>
        <span className="remote-ready"><Icon icon={Check} size={20} /></span>
        <CopyField value={current?.url ?? progress.result?.url ?? ""} label={t("connect.remoteLink")} />
        <Status tone={current?.state === "ready" ? "success" : "warning"}>{t(current?.state === "ready" ? "connect.onlineApproved" : "connect.offline")}</Status>
        <div className="actions"><Button disabled={busy || !relay.relays.some(r => r.ingressId === current?.id && r.owner)} onClick={() => void perform(async () => { const owner = relay.relays.find(r => r.ingressId === current?.id && r.owner)!; await copyText((await api<{ link: string }>("relay/share", "POST", { id: owner.id })).link); notify(t("connect.shareCopied")); })}>{t("connect.share")}</Button>
          <Button variant="primary" disabled={current?.state !== "ready"} onClick={() => flow.source ? void selectSource(flow.source) : step("sources")}>{t("addControlSource")}</Button></div>
      </>}
      {flow.step === "sources" && <>
        <div className="source-grid">{["claude", "chatgpt", "gemini", "grok", "microsoft-copilot", "custom"].map(id => <Button className={id === "custom" ? "source-card custom" : "source-card"} key={id} data-source={id} onClick={() => void selectSource(id)}><SourceIcon platform={id} /><strong>{controlSource(id)?.shortName ?? t("connect.other")}</strong>{id === "claude" && <small>{t("connect.recommended")}</small>}</Button>)}</div>
        <div className="remote-footer"><Status tone={remoteIngress(status?.ingresses) ? "success" : "neutral"}>{t(remoteIngress(status?.ingresses) ? "connect.remoteOnline" : "connect.remoteOffline")}</Status><Button variant="ghost" onClick={() => { onboarding.set(undefined); navigation.set(old => ({ ...old, page: "settings" })); }}>{t("connect.manage")}</Button></div>
      </>}
      {flow.step === "connect" && current && <ol className="connection-steps">
        <li><strong>{t("connect.copyLink")}</strong><CopyField value={current.url} label={t("connect.remoteLink")} />{copied && <small>{t("connect.copied")}</small>}</li>
        <li><strong>{t("connect.pasteInto", { name })}</strong><p className="muted">{source?.setup?.path[locale.get()] ?? t("connect.customPath")}</p>{source?.setup?.url && <Button onClick={() => void perform(async () => { await openUrl(source.setup.url); })}>{t("connect.openSettings", { name })} ↗</Button>}</li>
        <li><strong>{t("connect.returnApprove")}</strong>{waiting ? <ApprovalCard inline key={waiting.id} request={waiting} ingress={current} /> : flow.requestId ? <Notice>{t("connect.requestExpired")}</Notice> : <Loading label={t("connect.waitClient", { name })} />}
          {flow.requestId && (!waiting || ["denied", "expired"].includes(waiting.status)) && <Button onClick={() => void selectSource(flow.source!)}>{t("retry")}</Button>}</li>
      </ol>}
      {!["progress", "welcome"].includes(flow.step) && <Button variant="ghost" disabled={busy} onClick={() => flow.step === "connect" ? step("sources") : openOnboarding("welcome")}>{t("back")}</Button>}
    </div>
  </Dialog>;
}
