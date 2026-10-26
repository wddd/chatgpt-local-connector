import { useState } from "react";
import { accountsApi } from "../api";
import { refreshAccounts } from "../state/accounts";
import { t } from "../i18n";
import type { ProviderAccount, AccountLogin } from "../types";
import { Button, Notice, Row, Status, Switch } from "./ui";
import AddAccount from "./AddAccount";
export default function AgentAccount({ account, agent }: { account: ProviderAccount; agent: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [login, setLogin] = useState<AccountLogin>();
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await work(); await refreshAccounts(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <section className="account-card">
    {account.agentProfiles.filter(profile => profile.agent === agent).map(profile => <div key={profile.profileId} className="account-profile">
      <Status tone={profile.state === "signed-in" ? "success" : "warning"}>{t(`accounts.profile.${profile.state}`)}</Status>
      <Row title={t("accounts.default")}><Switch label={t("accounts.default")} checked={profile.default} disabled={busy || profile.state !== "signed-in"} onChange={value => void action(() => accountsApi.update({ id: account.id, defaultFor: agent, default: value }))} /></Row>
      {["claude", "codex"].includes(agent) ? <Button variant="link" disabled={busy} onClick={() => void action(async () => setLogin(await accountsApi.reauth({ id: account.id, agent })))}>{t("accounts.reauth")}</Button> : <p className="muted">{t("accounts.nativeAuth")}</p>}
    </div>)}
    {error && <Notice>{error}</Notice>}
    {login && <AddAccount initialLogin={login} onClose={() => setLogin(undefined)} />}
  </section>;
}
