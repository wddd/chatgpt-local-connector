import { StateBadge, Button, Icon, Notice } from "./ui";
import { statePresentation } from "./objects/statePresentation";
import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { connector } from "../state/connector";
import { onboarding } from "../state/onboarding";
import { permissions, permissionsReady } from "../state/permissions";
import { navigation } from "../state/navigation";
import { isPendingSource } from "../sourcePresentation";
import type { Login } from "../state/types";
import AddControlSource from "./AddControlSource";

export default function Onboarding({ returnFocus }: { returnFocus?: string }) {
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
  if (flow.step !== "welcome") return <AddControlSource returnFocus={returnFocus} />;
  return <section className="fixed inset-0 z-30 flex flex-col items-center justify-start overflow-auto bg-background px-6 py-12 sm:justify-center" aria-labelledby="welcome-title">
    <img className="size-16 shrink-0" src={new URL("../assets/arc/mark.svg", import.meta.url).href} alt="ARC" />
    <h1 id="welcome-title" className="mt-6 text-2xl font-semibold">{t("setup.welcomeTitle")}</h1>
    <p className="mt-3 text-center text-sm text-muted-foreground">{t("setup.welcomeSubtitle")}</p>
    {error && <Notice>{error}</Notice>}
    <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">{(["local", "remote"] as const).map(group => <Button key={group} className="h-auto flex-col items-start justify-start gap-2 whitespace-normal rounded-lg p-6 text-start [&>strong]:mt-3 [&>strong]:text-lg [&>span]:text-sm [&>span]:text-muted-foreground [&>small]:mt-3 [&>small]:rounded-full [&>small]:bg-secondary [&>small]:px-2 [&>small]:py-1 [&>small]:text-xs [&>small]:font-normal [&>small]:text-muted-foreground" onClick={() => onboarding.set({ step: "product", focusGroup: group })}>
      <Icon icon={group === "local" ? Monitor : Smartphone} size={20} />
      <strong>{t(`setup.welcome.${group}`)}</strong><span>{t(`setup.welcome.${group}Products`)}</span>
      <small>{t(`setup.welcome.${group}Time`)}</small>
    </Button>)}</div>
    <footer className="mt-10 flex flex-wrap items-center justify-center gap-3"><Button variant="ghost" disabled={busy} onClick={() => login === "authenticated" ? (onboarding.set(undefined), navigation.set(old => ({ ...old, page: "settings" }))) : void signIn()}><StateBadge presentation={statePresentation("profile", login === "authenticated" ? "signed-in" : "signed-out")} label={t(login === "authenticated" ? "connect.codexReady" : "connect.codexFix")} /></Button>
      <Button variant="ghost" onClick={() => { onboarding.set(undefined); navigation.set(old => ({ ...old, page: "settings", settingsPermissions: true })); }}><StateBadge presentation={statePresentation("permission", permissionsReady(status?.ingresses ?? []) ? "granted" : "missing")} label={t(permissionsReady(status?.ingresses ?? []) ? "connect.permissionsReady" : "connect.permissionsFix")} /></Button>
    </footer>
  </section>;
}
