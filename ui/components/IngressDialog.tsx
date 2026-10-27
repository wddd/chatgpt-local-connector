import { SrcPlatformRow } from "./objects/src-platform";
import { ActionGroup, DangerZone, FormSection, Disclosure, SectionHeader, Button, Dialog, DialogClose, FormField, Input, IconButton, Notice, ChoiceControl, SingleChoice } from "./ui";
import { useState, useRef, useEffect, type ReactNode, type ComponentProps } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { displayMessage } from "../messages";
import { openUrl } from "../platform";
import {
  controlSource,
  curatedSources,
  nextSourceName,
} from "../controlSources";
import {
  providers,
  fixedDomain,
  needsCredential,
  credentialSaved,
  secretFields,
} from "../ingressConfig";
import { validDomain } from "../formRules";
import { connectionForm, type ConnectionForm } from "../state/connectionForm";
import { connector, refreshConnector } from "../state/connector";
import type { Ingress } from "../state/types";
import type { ToolPolicy } from "../toolPolicy";
import { SensitiveInput, useSensitiveText } from "./Sensitive";
import ToolPolicyField from "./ToolPolicyField";
export default function IngressDialog({
  ingress: initialIngress,
  initialProduct,
  initialTransport,
  initialProvider,
  connectionOnly = false,
  focusField,
  onClose,
  onDismiss,
  onSaved,
  onRemoved,
  embedded = false,
  onBusy,
  setupFormId,
}: {
  initialProduct?: string;
  initialTransport?: "https" | "openai-tunnel";
  initialProvider?: "custom";
  connectionOnly?: boolean;
  embedded?: boolean;
  onBusy?: (busy: boolean) => void;
  setupFormId?: string;
  ingress?: Ingress;
  focusField?: string;
  onClose: () => void;
  onDismiss?: () => void;
  onSaved: (ingress: Ingress) => void;
  onRemoved: () => void;
}) {
  const { status } = connector.use();
  const ingress = status?.ingresses.find(i => i.id === initialIngress?.id) ?? initialIngress;
  const dirty = useRef(new Set<string>());
  const [selected, setSelected] = useState(
    ingress
      ? controlSource(ingress.controlSource)?.curated
        ? ingress.controlSource
        : "custom"
      : initialProduct ?? "",
  );
  const [source, setSource] = useState(ingress?.controlSource || initialProduct || ""),
    [name, setName] = useState(ingress?.name || (connectionOnly ? nextSourceName(t(initialTransport === "openai-tunnel" ? "source.kind.openai" : initialProvider === "custom" ? "connect.customAddress" : "source.kind.tunnel"), status?.ingresses.map(i => i.name) ?? []) : initialProduct ? nextSourceName(initialProduct, status?.ingresses.map(i => i.name) ?? []) : "")),
    [form, setForm] = useState(() => {
      const f = connectionForm(ingress?.config);
      if (ingress)
        f.connectionMode =
          ingress.transport === "openai-tunnel" ? "tunnel" : "https";
      if (!ingress && initialTransport) f.connectionMode = initialTransport === "openai-tunnel" ? "tunnel" : "https";
      if (!ingress && setupFormId && initialTransport === "https") { f.httpsProvider = "cloudflare"; f.cloudflareMode = "named"; }
      if (!ingress && initialProvider) f.httpsProvider = initialProvider;
      return f;
    });
  const [auth, setAuth] = useState(
      ingress?.auth === "oauth"
        ? "oauth"
        : ingress?.auth === "bearer"
          ? "bearer"
          : initialProduct ? controlSource(initialProduct)?.httpsAuth ?? "oauth" : "none",
    ),
    [toolPolicy, setToolPolicy] = useState<ToolPolicy | undefined>(
      ingress?.toolPolicy,
    );
  const protect = useSensitiveText([form.domain, form.tunnelId, ...secretFields.map(field => String(form[field.key]))]);
  const [advanced, setAdvanced] = useState(false);
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ingress) return;
    const incoming = connectionForm(ingress.config);
    incoming.connectionMode = ingress.transport === "openai-tunnel" ? "tunnel" : "https";
    setForm(old => {
      const next = { ...old };
      for (const key of Object.keys(incoming) as (keyof ConnectionForm)[]) {
        if (!dirty.current.has(key)) Object.assign(next, { [key]: incoming[key] });
      }
      return next;
    });
    if (!dirty.current.has("name")) setName(ingress.name);
    if (!dirty.current.has("source")) {
      setSource(ingress.controlSource);
      setSelected(controlSource(ingress.controlSource)?.curated ? ingress.controlSource : "custom");
    }
    if (!dirty.current.has("auth")) setAuth(ingress.auth === "oauth" ? "oauth" : ingress.auth === "bearer" ? "bearer" : "none");
    if (!dirty.current.has("toolPolicy")) setToolPolicy(ingress.toolPolicy);
    setErrors(old => Object.fromEntries(Object.entries(old).filter(([key]) => dirty.current.has(key))));
  }, [ingress]);
  const pickerRef = useRef<HTMLDivElement>(null);
  const lastSelection = useRef("");
  useEffect(() => {
    if (selected) lastSelection.current = selected;
    else if (lastSelection.current) Array.from(pickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []).find(button => button.getAttribute('aria-label') === (lastSelection.current === 'custom' ? t('customControlSource') : controlSource(lastSelection.current)?.displayName))?.focus();
  }, [selected]);
  const formRef = useRef<HTMLFormElement>(null);
  const preset = controlSource(selected),
    provider = providers[form.httpsProvider],
    https = form.connectionMode === "https",
    allowTunnel =
      !connectionOnly && (selected === "chatgpt" || selected === "custom" && !initialProduct);
  function change<K extends keyof ConnectionForm>(
    key: K,
    value: ConnectionForm[K],
  ) {
    dirty.current.add(key);
    if (["connectionMode", "httpsProvider", "cloudflareMode", "ngrokMode", "pinggyMode", "localxposeMode"].includes(key)) dirty.current.add("domain");
    setForm((old) => ({
      ...old,
      [key]: value,
      ...([
        "connectionMode",
        "httpsProvider",
        "cloudflareMode",
        "ngrokMode",
        "pinggyMode",
        "localxposeMode",
      ].includes(key)
        ? { domain: "" }
        : {}),
    }));
    setErrors((old) => ({ ...old, [key]: "" }));
  }
  function choose(value: string) {
    if (value === lastSelection.current) { setSelected(value); return; }
    const preset = controlSource(value),
      f = connectionForm();
    f.connectionMode =
      preset?.recommendedTransport === "openai-tunnel" ? "tunnel" : "https";
    f.cloudflareMode = f.connectionMode === "tunnel" ? "quick" : "named";
    for (const key of [...Object.keys(f), "source", "name", "auth"]) dirty.current.add(key);
    setSelected(value);
    setSource(value === "custom" ? "" : value);
    setName(
      value === "custom"
        ? ""
        : nextSourceName(value, status?.ingresses.map((i) => i.name) || []),
    );
    setForm(f);
    setAuth(preset?.httpsAuth ?? "bearer");
    setErrors({});
  }
  function validate() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t("fieldRequired");
    else if (new TextEncoder().encode(name).length > 120)
      next.name = t("sourceNameTooLong");
    if (selected === "custom" && !/^[a-zA-Z0-9_-]+$/.test(source))
      next.source = t("validClientId");
    if (!https) {
      if (!/^tunnel_[a-zA-Z0-9_-]+$/.test(form.tunnelId))
        next.tunnelId = t("validTunnelId");
      if (!form.apiKey.trim() && !ingress?.config.hasApiKey)
        next.apiKey = t("fieldRequired");
    } else {
      if (fixedDomain(form) && !validDomain(form.domain))
        next.domain = t("validDomain");
      const key = provider.credential;
      if (
        needsCredential(form) &&
        key &&
        !form[key].trim() &&
        !credentialSaved(ingress?.config, key)
      )
        next[key] = t("fieldRequired");
    }
    setErrors(next);
    if (Object.keys(next).length) {
      setAdvanced(true);
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>("[aria-invalid=true]")
          ?.focus(),
      );
      return false;
    }
    return true;
  }
  async function save() {
    if (working || !validate()) return;
    setWorking(true);
    setError("");
    try {
      const config: Record<string, unknown> = { ...form };
      delete config.connectionMode;
      delete config.domain;
      const origin = fixedDomain(form) ? `https://${form.domain.trim()}` : "";
      config.httpsUrl = origin ? `${origin}/mcp` : "";
      config.ngrokEndpoint = form.httpsProvider === "ngrok" ? origin : "";
      if (!ingress) {
        delete config.httpsPort;
        delete config.httpsHost;
      }
      for (const { key } of secretFields) if (!config[key]) delete config[key];
      const bearer = https && auth === "bearer";
      const metadata = {
        ...(!ingress ? { toolPolicy } : {}),
        name: name.trim(),
        controlSource: selected === "custom" ? source : selected,
        auth: https ? auth : "openai",
        ...(bearer && ingress?.auth !== "bearer"
          ? {
              bearerToken: Array.from(
                crypto.getRandomValues(new Uint8Array(32)),
                (byte) => byte.toString(16).padStart(2, "0"),
              ).join(""),
            }
          : {}),
      };
      const saved = await api<Ingress>(
        ingress ? `ingress/${ingress.id}` : "ingress",
        ingress ? "PUT" : "POST",
        { ...metadata, transport: https ? "https" : "openai-tunnel", config },
      );
      await refreshConnector().catch(() => {});
      onSaved(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }
  async function remove() {
    if (!ingress || working) return;
    setWorking(true);
    setError("");
    try {
      await api(`ingress/${ingress.id}`, "DELETE");
      await refreshConnector();
      onRemoved();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }
  const textField = (
    key: keyof ConnectionForm,
    label: string,
    password = false,
    placeholder = "",
    help?: ReactNode,
  ) => (
    <FormField
      id={`ingress-${key}`}
      label={label}
      help={key === "domain" ? t("setup.domainHint") : help}
      error={errors[key]}
    >
      <SensitiveInput
        className={key === "tunnelId" || secretFields.some(field => field.key === key) ? "mono" : undefined}
        id={`ingress-${key}`}
        type={password ? "password" : "text"}
        autoComplete={password ? "new-password" : "off"}
        value={String(form[key])}
        onChange={(e) => change(key, e.target.value as never)}
        placeholder={placeholder}
        disabled={working}
        required={key === "domain" || key === "tunnelId"}
      />
    </FormField>
  );
  useEffect(() => { onBusy?.(working); return () => onBusy?.(false); }, [working, onBusy]);
  const nameField = (<FormField
            id="ingress-name"
            label={t(connectionOnly ? "setup.connectionName" : "sourceName")}
            help={!connectionOnly && preset?.docs[0] && <a className="m-0 text-sm text-muted-foreground" href={preset.docs[0]} onClick={(e) => { e.preventDefault(); void openUrl(preset.docs[0]!).catch(e => setError(String(e))); }}>{t("officialSetup")}</a>}
            error={errors.name}
          >
            <Input
              id="ingress-name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((old) => ({ ...old, name: "" }));
              }}
              disabled={working}
            />
          </FormField>);
  const Frame = setupFormId ? IngressSetupBody : embedded ? IngressEditLayer : Dialog;
  return (
    <Frame
      initialFocus={focusField ? `ingress-${focusField}` : undefined}
      title={connectionOnly ? t("source.newConnection") : `${t(ingress ? "source.editConnection" : "source.newConnection")}${selected ? " · " + (preset?.displayName || t("customControlSource")) : ""}`}
      onClose={() => !ingress && !initialProduct && selected ? setSelected("") : onClose()}
      onDismiss={onDismiss ?? onClose}
      depthOffset={!ingress && !initialProduct && selected ? 1 : 0}
      leading={connectionOnly ? null : !ingress && !initialProduct && selected ? <IconButton icon={ChevronLeft} label={t("back")} disabled={working} onClick={() => setSelected("")} /> : undefined}
      actions={connectionOnly && onDismiss ? <IconButton icon={X} label={t("close")} disabled={working} onClick={onDismiss} /> : undefined}
      width={!selected ? 480 : undefined}
      busy={working}
      footer={
        selected && (
          <ActionGroup>
            {embedded ? <Button disabled={working} onClick={onClose}>{t(connectionOnly ? "back" : "cancel")}</Button> : <DialogClose asChild>
              <Button disabled={working}>{t("cancel")}</Button>
            </DialogClose>}
            <Button
              variant="primary"
              busy={working}
              onClick={() => void save()}
            >
              {t(connectionOnly ? "source.next" : "save")}
            </Button>
          </ActionGroup>
        )
      }
    >
      {!selected ? (
        <div className="min-w-0 [&_.entity-row]:p-0 [&_.entity-row]:flex-1" ref={pickerRef}>
          <SingleChoice tiles label={t('source.product')} value="" onChange={choose} options={[
            ...curatedSources.map(p => ({ value: p.id, label: p.displayName, content: <SrcPlatformRow product={p.id} /> })),
            { value: 'custom', label: t('customControlSource'), content: <SrcPlatformRow product="custom" label={t('customControlSource')} /> },
          ]} />
        </div>
      ) : (
        <form
          onChangeCapture={e => { const id = (e.target as HTMLElement).id; if (id.startsWith("ingress-")) dirty.current.add(id.slice(8)); }}
          id={setupFormId}
          className="grid min-w-0 gap-5"
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection>
          {!connectionOnly && <p className="m-0 text-sm text-muted-foreground">{t(selected === "claude" ? "wakeClaude" : selected === "chatgpt" ? "wakeChatgpt" : "wakeOther")}</p>}
          {https &&
            auth === "bearer" &&
            preset &&
            !preset.supportedAuth.includes("bearer") && (
              <Notice tone="warning">{t("presetAuthMismatch")}</Notice>
            )}
          {!setupFormId && nameField}
          {selected === "custom" && !connectionOnly && (
            <FormField
              id="ingress-source"
              label={t("controlSourceId")}
              error={errors.source}
            >
              <Input
                className="font-mono"
                id="ingress-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={working}
              />
            </FormField>
          )}
          {allowTunnel && (
            <FormField label={t("connectionMethod")}>
              <ChoiceControl
                value={form.connectionMode}
                onChange={(value) =>
                  change(
                    "connectionMode",
                    value as ConnectionForm["connectionMode"],
                  )
                }
                label={t("connectionMethod")}
                disabled={working}
                options={[
                  { value: "tunnel", label: "OpenAI Secure Tunnel" },
                  { value: "https", label: "HTTPS MCP" },
                ]}
              />
            </FormField>
          )}
          {!https ? (
            <>
              {textField(
                "tunnelId",
                "Tunnel ID",
                false,
                "tunnel_…",
<a href="https://platform.openai.com/settings/organization/tunnels" onClick={(e) => { e.preventDefault(); void openUrl(e.currentTarget.href).catch(e => setError(String(e))); }}>{t("getCredentials")}</a>,
              )}
              {textField(
                "apiKey",
                "Runtime API Key",
                true,
                ingress?.config.hasApiKey
                  ? t("savedLeaveBlankToKeep")
                  : t("pasteRuntimeKey"),
                <a href="https://platform.openai.com/settings/organization/api-keys" onClick={(e) => { e.preventDefault(); void openUrl(e.currentTarget.href).catch(e => setError(String(e))); }}>{t("getApiKey")}</a>,
              )}
            </>
          ) : (
            <>
              <FormField
                label={t("connectionMethod") + (allowTunnel ? "" : " · HTTPS MCP")}
              >
                <ChoiceControl
                  value={form.httpsProvider}
                  onChange={(value) =>
                    change(
                      "httpsProvider",
                      value as ConnectionForm["httpsProvider"],
                    )
                  }
                  label={t("connectionMethod")}
                  disabled={working}
                  options={Object.entries(providers).map(([value, p]) => ({
                    value,
                    label: value === "custom" ? t("customDomain") : p.label,
                  }))}
                />
              </FormField>
              {provider.mode && provider.modes.length > 1 && (
                <FormField label={t("domainMode")}>
                  <ChoiceControl
                    value={form[provider.mode]}
                    onChange={(value) =>
                      change(provider.mode!, value as "named" | "quick")
                    }
                    label={t("domainMode")}
                    disabled={working}
                    options={provider.modes.map((value) => ({
                      value,
                      label: t(
                        value === "named" ? "fixedDomain" : "temporaryDomain",
                      ),
                    }))}
                  />
                </FormField>
              )}
              {form.httpsProvider === "cloudflare" && form.cloudflareAuth === "login" && <Notice>{t("setup.cloudflare-managed")}</Notice>}
              {fixedDomain(form) &&
                textField("domain", t("domain"), false, "mcp.example.com")}
              {setupFormId && nameField}
              <Disclosure title={t("setup.advanced")} open={advanced} onOpenChange={setAdvanced}><FormSection>
              {needsCredential(form) &&
                provider.credential &&
                textField(
                  provider.credential,
                  provider.credentialLabel,
                  true,
                  credentialSaved(ingress?.config, provider.credential)
                    ? t("savedLeaveBlankToKeep")
                    : t("pasteCredential", { provider: provider.label, credential: provider.credentialLabel }),
                  provider.help && <a href={provider.help} onClick={(e) => { e.preventDefault(); void openUrl(provider.help!).catch(e => setError(String(e))); }}>{t("getCredentials")}</a>,
                )}
              <FormField label={t("authentication")}>
                <ChoiceControl
                  value={auth}
                  onChange={value => { dirty.current.add("auth"); setAuth(value); }}
                  label={t("authentication")}
                  disabled={working}
                  options={[
                    { value: "none", label: t("authNone") },
                    { value: "bearer", label: "Bearer" },
                    { value: "oauth", label: "OAuth" },
                  ]}
                />
              </FormField>
              {!ingress && <ToolPolicyField value={toolPolicy} onChange={setToolPolicy} disabled={working} />}
              </FormSection></Disclosure>
            </>
          )}
          {!https && setupFormId && nameField}
          {!ingress && !https && <ToolPolicyField
            value={toolPolicy}
            onChange={value => { dirty.current.add("toolPolicy"); setToolPolicy(value); }}
            disabled={working}
          />}
          {error && <Notice>{protect(displayMessage(error))}</Notice>}
          </FormSection>
          {ingress && <DangerZone consequence={t("setup.removeConsequence")}>
            <Button variant="danger-outline" disabled={working} onClick={() => void remove()}>{t("remove")}</Button>
          </DangerZone>}
        </form>
      )}
    </Frame>
  );
}

function IngressEditLayer({ title, children, footer, onClose, initialFocus, busy, leading, actions }: ComponentProps<typeof Dialog>) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = initialFocus ? root.current?.querySelector<HTMLElement>(`#${CSS.escape(initialFocus)}`) : root.current?.querySelector<HTMLElement>("h2");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocus]);
  return <section className="ingress-edit-layer side-panel-layer" ref={root}>
    <SectionHeader className="dialog-header" data-leading={leading === null ? 'false' : 'true'} level={2} leading={<>{leading === undefined ? <IconButton icon={ChevronLeft} label={t("back")} disabled={busy} onClick={onClose} /> : leading}</>} title={title} titleProps={{ className: 'activity-panel-title', tabIndex: -1 }} actions={actions} />
    <div className="side-panel-scroll">{children}</div><footer className="dialog-footer">{footer}</footer>
  </section>;
}

function IngressSetupBody({ children }: ComponentProps<typeof Dialog>) { return <>{children}</>; }
