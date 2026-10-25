import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { copyText } from "../platform";
import { useInterval } from "../state/hooks";
import { Button, Dialog, Field, Group, IconButton, Input, Notice, Row, SingleChoice, Textarea } from "./ui";

type Account = { id: string; identity: { loggedIn?: boolean; email?: string; orgName?: string; authMethod?: string }; observedAt: string | null };
type Login = { id: string; accountId: string; browserId: string; browserName: string; state: string; loginUrl?: string; browserError?: string; error?: string };
type Snapshot = { accounts: Account[]; cliAvailable: boolean; login: Login | null };
type Browser = { id: string; name: string };
const pending = (login?: Login | null) => !!login && ["starting", "waiting"].includes(login.state);

export default function ClaudeAccounts() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [hostAccount, setHostAccount] = useState<Account>();
  const initialized = useRef(false), refreshing = useRef(false);
  const [notifyAccount, setNotifyAccount] = useState<Account>();
  const [target, setTarget] = useState(""), [message, setMessage] = useState("");
  const [sendResult, setSendResult] = useState(""), [targetError, setTargetError] = useState(""), [messageError, setMessageError] = useState("");
  const [browsers, setBrowsers] = useState<Browser[]>([]), [browser, setBrowser] = useState("default");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showLogin, setShowLogin] = useState(false), [remove, setRemove] = useState<Account>();
  const [code, setCode] = useState(""), [codeError, setCodeError] = useState("");
  const login = snapshot?.login, active = pending(login);
  const selectedBrowser = active ? login!.browserId : browser;
  const browserOptions = [{ value: "default", label: t("claudeAccounts.defaultBrowser") }, ...browsers.map(b => ({ value: b.id, label: b.name }))];
  if (active && !browserOptions.some(option => option.value === selectedBrowser)) browserOptions.push({ value: selectedBrowser, label: login!.browserName });
  const label = (account: Account) => account.identity.email || t("claudeAccounts.profile", { id: account.id.slice(0, 8) });

  async function refresh() {
    const next = await api<Snapshot>("claude-accounts"); setSnapshot(next);
    if (!initialized.current) {
      await Promise.all([refreshBrowsers(), ...(next.cliAvailable ? [refreshHost()] : [])]);
      initialized.current = true;
    }
    setLoadError("");
  }
  async function refreshBrowsers() {
    const data = await api<{ browsers: Browser[] }>("claude-accounts/browsers");
    setBrowsers(data.browsers);
    setBrowser(current => current === "default" || data.browsers.some(b => b.id === current) ? current : "default");
  }
  async function refreshHost() { setHostAccount(await api<Account>("claude-accounts/default")); }
  useInterval(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    void refresh().catch(e => setLoadError(String(e))).finally(() => { refreshing.current = false; });
  }, 2000, true);

  async function action(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); await refresh(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function start(accountId?: string) {
    await action(async () => {
      const login = await api<Login>("claude-accounts/login", "POST", { browserId: browser, ...(accountId ? { accountId } : {}) });
      setSnapshot(old => old && ({ ...old, login }));
      setCode(""); setCodeError(""); setShowLogin(true);
    });
  }
  async function submitCode() {
    if (!code.trim()) { setCodeError(t("claudeAccounts.codeRequired")); document.getElementById("claude-login-code")?.focus(); return; }
    setBusy(true); setCodeError("");
    try {
      await api("claude-accounts/login/code", "POST", { loginId: login?.id, code: code.trim() });
      setCode("");
    } catch (e) { setCodeError(String(e)); document.getElementById("claude-login-code")?.focus(); }
    finally { setBusy(false); }
  }
  async function openNotification(account: Account) {
    await action(async () => {
      const { routes } = await api<{ routes: Record<string, string> }>("claude-accounts/routes");
      setNotifyAccount(account); setTarget(Object.keys(routes).find(key => routes[key] === account.id) || "");
      setMessage(""); setSendResult(""); setTargetError(""); setMessageError("");
    });
  }
  async function sendNotification(routeOnly = false) {
    setTargetError(""); setMessageError(""); setSendResult("");
    if (!target.trim()) { setTargetError(t("claudeAccounts.targetRequired")); document.getElementById("claude-notify-target")?.focus(); return; }
    if (!routeOnly && !message.trim()) { setMessageError(t("claudeAccounts.messageRequired")); document.getElementById("claude-notify-message")?.focus(); return; }
    setBusy(true); setError("");
    try {
      const body = { accountId: notifyAccount!.id, target: target.trim() };
      await api(routeOnly ? "claude-accounts/routes" : "claude-accounts/send", routeOnly ? "PUT" : "POST", routeOnly ? body : { ...body, message });
      setSendResult(t(routeOnly ? "claudeAccounts.routeSaved" : "claudeAccounts.sent"));
    } catch (e) {
      const detail = String(e);
      if (detail.includes("INVALID_CLAUDE_SESSION")) { setTargetError(detail); document.getElementById("claude-notify-target")?.focus(); }
      else setError(detail);
    } finally { setBusy(false); }
  }
  const authenticated = login && snapshot?.accounts.find(a => a.id === login.accountId);
  return <Group title={t("claudeAccounts.title")}>
    <div className="claude-account-actions">
      <div className="claude-browser-choice"><SingleChoice label={t("claudeAccounts.browser")} value={selectedBrowser} onChange={setBrowser} disabled={busy || active}
        options={browserOptions} /></div>
      <IconButton icon={RefreshCw} label={t("claudeAccounts.refreshBrowsers")} disabled={busy || active} onClick={() => void action(refreshBrowsers)} />
      <Button id="claude-account-login" variant="primary" busy={busy} disabled={!snapshot?.cliAvailable}
        onClick={() => active ? setShowLogin(true) : void start()}>{t(active ? "claudeAccounts.continue" : "claudeAccounts.login")}</Button>
    </div>
    {snapshot && !snapshot.cliAvailable && <Notice tone="warning">{t("claudeAccounts.installCli")}</Notice>}
    {(error || loadError) && <Notice tone="danger">{error || loadError}</Notice>}
    {[...(hostAccount ? [hostAccount] : []), ...(snapshot?.accounts || [])].map(account => <Row key={account.id} title={label(account)} description={account.id === "default" ? t("claudeAccounts.hostAccount") : account.identity.orgName}>
      <div className="claude-account-row">
        <span title={account.observedAt ? new Date(account.observedAt).toLocaleString() : undefined}>{t(account.identity.loggedIn === true ? "claudeAccounts.signedIn" : account.identity.loggedIn === false ? "claudeAccounts.signedOut" : "claudeAccounts.unfinished")}</span>
        <IconButton icon={RefreshCw} label={t("claudeAccounts.checkAccount", { account: label(account) })} disabled={busy || active}
          onClick={() => void action(async () => { if (account.id === "default") await refreshHost(); else await api(`claude-accounts/${account.id}/refresh`, "POST"); })} />
        <Button id={`claude-notify-${account.id}`} disabled={busy || active} onClick={() => void openNotification(account)}>{t("claudeAccounts.notify")}</Button>
        {account.id !== "default" && <><Button disabled={busy || active} onClick={() => void start(account.id)}>{t("claudeAccounts.relogin")}</Button>
        <Button variant="ghost" disabled={busy || active} onClick={() => { setError(""); setRemove(account); }}>{t("claudeAccounts.removeAction")}</Button></>}
      </div>
    </Row>)}
    {showLogin && login && <Dialog centered title={t("claudeAccounts.login")} onClose={() => setShowLogin(false)} returnFocus="#claude-account-login"
      footer={<>{active && <Button disabled={busy} onClick={() => void action(async () => { await api("claude-accounts/login/cancel", "POST", { loginId: login.id }); })}>{t("cancel")}</Button>}
        <Button onClick={() => setShowLogin(false)}>{t("close")}</Button></>}>
      <div className="claude-login-content">
        {error && <Notice tone="danger">{error}</Notice>}
        <p role="status">{t(`claudeAccounts.state.${login.state}`)}</p>
        {login.state === "completed" && authenticated && <strong>{label(authenticated)}{authenticated.identity.orgName ? ` · ${authenticated.identity.orgName}` : ""}</strong>}
        {login.browserError && active && <Notice tone="warning">{login.browserError}</Notice>}
        {login.error && login.state === "failed" && <Notice tone="danger">{login.error}</Notice>}
        {login.loginUrl && active && <>
          <Button onClick={() => void copyText(login.loginUrl!).catch(e => setError(String(e)))}>{t("claudeAccounts.copyLink")}</Button>
          <details><summary>{t("claudeAccounts.enterCode")}</summary>
            <form onSubmit={event => { event.preventDefault(); void submitCode(); }}>
              <Field id="claude-login-code" label={t("claudeAccounts.code")} error={codeError}>
                <Input id="claude-login-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off"
                  aria-invalid={!!codeError} aria-describedby={codeError ? "claude-login-code-error" : undefined} disabled={busy} />
              </Field>
              <Button type="submit" busy={busy}>{t("submit")}</Button>
            </form>
          </details>
        </>}
      </div>
    </Dialog>}
    {notifyAccount && <Dialog centered title={`${t("claudeAccounts.notify")} · ${label(notifyAccount)}`} onClose={() => setNotifyAccount(undefined)} busy={busy} returnFocus={`#claude-notify-${notifyAccount.id}`}
      footer={<><Button disabled={busy} onClick={() => void sendNotification(true)}>{t("claudeAccounts.saveRoute")}</Button>
        <Button variant="primary" busy={busy} type="submit" form="claude-notify-form">{t("claudeAccounts.send")}</Button></>}>
      <form id="claude-notify-form" className="claude-login-content" onSubmit={event => { event.preventDefault(); void sendNotification(); }}>
        <Field id="claude-notify-target" label={t("claudeAccounts.target")} error={targetError}>
          <Input id="claude-notify-target" value={target} onChange={event => setTarget(event.target.value)} disabled={busy}
            aria-invalid={!!targetError} aria-describedby={targetError ? "claude-notify-target-error" : undefined} />
        </Field>
        <Field id="claude-notify-message" label={t("claudeAccounts.message")} error={messageError}>
          <Textarea id="claude-notify-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={8000} disabled={busy}
            aria-invalid={!!messageError} aria-describedby={messageError ? "claude-notify-message-error" : undefined} />
        </Field>
        <p>{t("claudeAccounts.routeEffect")}</p>
        {error && <Notice tone="danger">{error}</Notice>}
        {sendResult && <p role="status">{sendResult}</p>}
      </form>
    </Dialog>}
    {remove && <Dialog centered title={t("claudeAccounts.remove")} onClose={() => setRemove(undefined)} busy={busy}
      footer={<><Button disabled={busy} onClick={() => setRemove(undefined)}>{t("cancel")}</Button><Button variant="danger" busy={busy}
        onClick={() => void action(async () => { await api(`claude-accounts/${remove.id}`, "DELETE"); setRemove(undefined); })}>{t("claudeAccounts.removeAction")}</Button></>}>
      <p>{t("claudeAccounts.removeConsequence", { account: label(remove) })}</p>
      {error && <Notice tone="danger">{error}</Notice>}
    </Dialog>}
  </Group>;
}
