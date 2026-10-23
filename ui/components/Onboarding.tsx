import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { connector } from "../state/connector";
import { onboarding } from "../state/onboarding";
import { permissions, permissionsReady } from "../state/permissions";
import { navigation } from "../state/navigation";
import { isPendingSource } from "../sourcePresentation";
import type { Login } from "../state/types";
import AddControlSource from "./AddControlSource";
import { Button, Dialog, Notice, Status } from "./ui";

export default function Onboarding() {
  const flow = onboarding.use()!, { status, sources, sourcesLoaded } = connector.use(); permissions.use();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [login, setLogin] = useState("loading");
  useEffect(() => {
    if (flow.step === "welcome" && sourcesLoaded && status && sources.some(s => s.state !== "revoked" && !isPendingSource(s, status.ingresses))) onboarding.set(undefined);
  }, [flow.step, sourcesLoaded, sources, status]);
  useEffect(() => {
    if (flow.step !== "welcome") return;
    const read = () => { void api<Login>("codex/login").then(v => setLogin(v.state)).catch(() => setLogin("unavailable")); };
    read(); window.addEventListener("focus", read); return () => window.removeEventListener("focus", read);
  }, [flow.step]);
  async function signIn() {
    setBusy(true); setError("");
    try { await api("codex/login", "POST"); setLogin((await api<Login>("codex/login")).state); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <Dialog title={t(flow.step === "welcome" ? "connect.title.welcome" : "addControlSource")} leading={flow.step === "welcome" ? <img className="welcome-logo" src={new URL("../assets/arc/mark.svg", import.meta.url).href} alt="ARC" /> : undefined}
    width={560} returnFocus=".hub-source" onClose={() => onboarding.set(undefined)} busy={busy}>
    <div className="onboarding">
      {flow.step === "welcome" ? <>
        {error && <Notice>{error}</Notice>}
        <div className="welcome-status"><Button variant="ghost" disabled={login === "authenticated" || busy} onClick={() => void signIn()}><Status tone={login === "authenticated" ? "success" : "warning"}>{t(login === "authenticated" ? "connect.codexReady" : "connect.codexFix")}</Status></Button>
          <Button variant="ghost" onClick={() => { onboarding.set(undefined); navigation.set(old => ({ ...old, page: "permissions" })); }}><Status tone={permissionsReady(status?.ingresses ?? []) ? "success" : "warning"}>{t(permissionsReady(status?.ingresses ?? []) ? "connect.permissionsReady" : "connect.permissionsFix")}</Status></Button></div>
        <div className="welcome-choices"><Button variant="primary" onClick={() => onboarding.set({ step: "product" })}>{t("addControlSource")}</Button></div>
      </> : <AddControlSource onBusy={setBusy} />}
    </div>
  </Dialog>;
}
