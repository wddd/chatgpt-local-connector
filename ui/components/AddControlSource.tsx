import { SrcPlatformRow } from "./objects/src-platform";
import PublicLinkDeployment from "./PublicLinkDeployment";
import Address from "./Address";
import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { api } from "../api";
import { controlSource } from "../controlSources";
import { locale, t } from "../i18n";
import { openUrl } from "../platform";
import { connector, refreshConnector } from "../state/connector";
import { onboarding, finishSourceSetup, addedSource, type OnboardingStep } from "../state/onboarding";
import { useRelays, publicRelay } from "../state/relay";
import SetupDialog from "./SetupDialog";
import { Button, Field, Icon, Loading, Notice, SingleChoice } from "./ui";
import { ApprovalCard } from "./OAuthApproval";

const products = ["claude", "chatgpt", "gemini", "grok", "grok-bot", "microsoft-copilot", "local-code", "local-desktop", "custom"];
export default function AddControlSource({ returnFocus }: { returnFocus?: string }) {
  const flow = onboarding.use()!, { status, sources } = connector.use();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [deploying, setDeploying] = useState(!!flow.deploying);
  const selectedProduct = flow.source ?? "";
  const info = controlSource(selectedProduct), product = info?.sourceProduct ?? flow.source ?? "custom";
  const local = info?.recommendedTransport === "local", name = product === "custom" ? t("setup.yourMcpClient") : info?.shortName ?? t("setup.yourMcpClient");
  const localPayload = JSON.stringify({ body: { target: info?.localTarget } });
  const localCommand = `${status?.platform === "win32" ? "" : "printf '%s' "}'${localPayload}' | arc cli call local-access.install --stdin`;
  const steps: OnboardingStep[] = local ? ["product", "address"] : ["product", "address", "approval", "success"];
  const entries = status?.ingresses ?? [], relays = useRelays(), relay = publicRelay(relays.relays);
  const current = entries.find(i => i.id === flow.ingressId);
  function bind(id: string) {
    onboarding.set(old => old && { ...old, step: "address", ingressId: id, requestId: undefined, sourceId: undefined,
      baseline: (connector.get().status?.ingresses.find(i => i.id === id)?.oauth?.pending ?? []).map(p => p.id) });
  }
  useEffect(() => {
    if (flow.step === "address" && !local && !flow.ingressId && relay?.ingressId) bind(relay.ingressId);
  }, [flow.step, flow.ingressId, local, relay?.ingressId]);
  function step(next: OnboardingStep) { setError(""); onboarding.set(old => old && { ...old, step: next }); }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  const pending = current?.oauth?.pending.filter(p => p.status === "pending" && !p.switchSourceId) ?? [];
  const waiting = current?.oauth?.pending.find(p => p.id === flow.requestId);
  useEffect(() => {
    if (flow.step !== "address" || current?.auth !== "oauth") return;
    const next = pending.find(p => !flow.baseline?.includes(p.id));
    if (next) onboarding.set(old => old?.step === "address" ? { ...old, step: "approval", requestId: next.id } : old);
  }, [flow.step, flow.ingressId, current?.oauth]);
  const connected = sources.find(s => s.ingressId === current?.id && s.product === product && s.state === "connected" && s.connectedAt !== null && (current?.auth !== "oauth" || s.credential.grantId === flow.requestId));
  useEffect(() => {
    if ((flow.step === "approval" || flow.step === "address" && current?.auth !== "oauth") && connected) onboarding.set(old => old && ["approval", "address"].includes(old.step) ? { ...old, step: "success", sourceId: connected.id } : old);
  }, [flow.step, connected?.id]);
  function retry() {
    onboarding.set(old => old && { ...old, step: "address", requestId: undefined, baseline: (current?.oauth?.pending ?? []).map(p => p.id) });
  }
  const added = sources.find(s => s.id === flow.sourceId);
  async function finish(addAnother = false) {
    await perform(async () => {
      await refreshConnector();
      if (addAnother) {
        if (flow.sourceId) addedSource.set(flow.sourceId);
        onboarding.set({ step: "product" });
      } else finishSourceSetup();
    });
  }
  function chooseProduct(value: string) {
    onboarding.set(old => old && { ...old, source: value,
      ingressId: undefined, requestId: undefined, sourceId: undefined });
  }
  const productName = (id: string) => id === "custom" ? t("setup.otherClient") : id === "local-code" ? "Claude Code" : id === "local-desktop" ? t("setup.claudeDesktop") : id === "microsoft-copilot" ? "Copilot" : controlSource(id)?.displayName ?? id;
  const title = selectedProduct ? t("setup.addProduct", { name: productName(selectedProduct) }) : t("addControlSource");
  const footer = <>
    {flow.step === "approval" && waiting?.status === "pending" && <><Button type="submit" form={`approval-${waiting.id}`} value="deny" disabled={busy}>{t("oauthDeny")}</Button><Button variant="primary" type="submit" form={`approval-${waiting.id}`} value="allow" busy={busy}>{t("oauthAllow")}</Button></>}
    {flow.step !== "product" && flow.step !== "success" && flow.step !== "approval" && <Button variant="ghost" disabled={busy || deploying} onClick={() => step(steps[Math.max(0, steps.indexOf(flow.step) - 1)])}>{t("back")}</Button>}
    {flow.step === "product" && <><span className="flex-1" /><Button variant="primary" busy={busy} disabled={!flow.source} onClick={() => step("address")}>{t("source.next")}</Button></>}
    {flow.step === "address" && !local && current && <Loading label={t(current?.auth === "oauth" ? "connect.waitClient" : "source.waitConnection", { name })} />}
    {flow.step === "address" && local && <Button variant="primary" onClick={finishSourceSetup}>{t("source.done")}</Button>}
    {flow.step === "success" && <><Button variant="ghost" disabled={busy} onClick={() => void finish(true)}>{t("setup.addAnother")}</Button><Button variant="primary" busy={busy} onClick={() => void finish()}>{t("source.done")}</Button></>}
  </>;
  return <SetupDialog title={title} steps={steps.filter(value => value !== "success").map((value, index) => ({ label: t(`source.step.${value}`), value: index === 0 ? productName(selectedProduct || "custom") : undefined }))}
    active={steps.indexOf(flow.step)} done={flow.step === "success"} busy={busy} onClose={finishSourceSetup}
    initialFocus={flow.step === "product" && flow.focusGroup ? `platform-${flow.focusGroup}` : undefined}
    returnFocus={returnFocus}
    footer={footer}>
    <div className="flex min-w-0 flex-col gap-4 [&_p]:m-0 [&_h3]:m-0">
    {!local && relays.loaded && !relay && relays.relays.some(relay => relay.owner) && <Notice>{t("connections.multiplePublicLinks")}</Notice>}
    {(error || !local && relays.error) && <Notice>{error || relays.error}</Notice>}
    {flow.step === "product" && <>
      {(["remote", "local"] as const).map(group => <section className="grid min-w-0 gap-2 [&>h3]:text-xs [&>h3]:font-normal [&>h3]:text-muted-foreground min-w-0 [&_.entity-row]:p-0 [&_.entity-row]:flex-1" key={group}>
        <h3 id={`platform-${group}`} tabIndex={-1}>{t(`setup.group.${group}`)}</h3>
        <SingleChoice tiles label={t(`setup.group.${group}`)} value={selectedProduct} onChange={chooseProduct}
          options={products.filter(id => (controlSource(id)?.recommendedTransport === "local") === (group === "local")).map(id => {
            return { value: id, label: productName(id), content: <SrcPlatformRow product={id.startsWith("local-") ? "claude" : id} label={productName(id)} /> };
          })} />
      </section>)}
    </>}
    {flow.step === "address" && (local ? <>
      <p>{t("connection.localSetup", { name })}</p>
      <Address value={localCommand} label={t("connections.localCommand")} />
      <p>{t("connect.restartClaude")}</p>
    </> : deploying ? <PublicLinkDeployment relayId={relay?.id} onReady={id => { setDeploying(false); bind(id); void relays.refresh().catch(() => {}); }} onCancel={() => { setDeploying(false); void relays.refresh().catch(() => {}); }} />
      : current ? <>
      <ol className="m-0 grid list-decimal gap-4 ps-5 marker:text-muted-foreground [&>li]:min-w-0 [&>li>div]:grid [&>li>div]:gap-2 [&_strong]:text-sm [&_p]:text-sm [&_p]:text-muted-foreground">
        <li><div><strong>{t("source.copyAddress")}</strong><Address value={current.url} label={t("source.copyAddress")} /></div></li>
        <li><div><strong>{t("setup.configureProduct", { name })}</strong><p>{info?.setup?.path[locale.get()] ?? t("connect.customPath")}</p>
          {info?.setup?.url && <Button onClick={() => void perform(() => openUrl(info.setup!.url))}>{t("connect.openSettings", { name })}<Icon icon={ExternalLink} /></Button>}</div></li>
        <li><div><strong>{t("setup.clickConnect", { name })}</strong><p>{t("setup.browserCode")}</p></div></li>
      </ol>
      {current.error && <Notice>{current.error}</Notice>}
      {current.state !== "ready" && <Button busy={busy} onClick={() => void perform(async () => {
        if (!current.enabled) await api(`ingress/${current.id}`, "PUT", { enabled: true });
        await api(`ingress/${current.id}/start`, "POST"); await refreshConnector();
      })}>{t("retry")}</Button>}
      {pending.length > 0 && <Button onClick={() => onboarding.set(old => old && { ...old, step: "approval", requestId: pending[0].id })}>{t("source.review")}</Button>}
    </> : !relays.loaded ? <Loading /> : relays.error ? <Button onClick={() => void relays.refresh().catch(() => {})}>{t("retry")}</Button>
      : relay || !relays.relays.some(item => item.owner) ? <Button variant="primary" onClick={() => setDeploying(true)}>{t(relay ? "retry" : "source.createRelay")}</Button> : null)}
    {flow.step === "approval" && <>
      {pending.length > 1 && <SingleChoice label={t("source.pendingRequests")} value={flow.requestId ?? ""} onChange={requestId => onboarding.set(old => old && { ...old, requestId })} options={pending.map(p => ({ value: p.id, label: `${p.clientName} · ${p.pairingCode ?? p.redirectUri}` }))} />}
      {waiting && current ? <ApprovalCard key={waiting.id} request={waiting} ingress={current} product={product} inline onBusy={setBusy} onDecided={allow => { if (!allow) retry(); }} /> : <Notice tone="warning">{t("connect.requestExpired")}</Notice>}
      {(!waiting || ["denied", "expired"].includes(waiting.status)) && <Button onClick={retry}>{t("retry")}</Button>}
    </>}
    {flow.step === "success" && <div className="flex min-h-60 min-w-0 flex-col items-center justify-center gap-3 text-center [&>h3]:mt-2 [&>h3]:text-lg [&>p]:text-sm [&>p]:text-muted-foreground [&>.field]:grid-cols-1 [&>.field]:mt-4 [&>.field]:w-full [&>.field]:text-start [&>.entity-card]:w-full [&>.entity-card]:text-start"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Icon icon={Check} size={20} /></span>
      <h3>{t("source.added", { name: added?.label ?? name })}</h3><p>{t("setup.via", { name: current?.name ?? t("source.connectionRemoved") })}</p>
      <Field label={t("setup.tryPrompt", { name })}><Address value={t("setup.firstPrompt")} label={t("copy")} /></Field>
    </div>}
    </div>
  </SetupDialog>;
}
