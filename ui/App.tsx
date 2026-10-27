import { ArrowLeft } from "lucide-react";
import { scenarioName } from "./scenarioMode";
import { captureRequest, type PanelRequest } from "./acceptance";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Logs,
  Settings,
  X,
  Maximize2,
  Minimize2,
  Network,
} from "lucide-react";
import { animate } from "motion";
import { reducedMotion } from "./motion/surface";
import { t, locale } from "./i18n";
import { copyText, isDesktop } from "./platform";
import { connector, notify, startConnector } from "./state/connector";
import { startAgents } from "./state/agents";
import { startSubscriptions } from "./state/subscriptions";
import { startAgentActivity } from "./state/activity";
import { startTasks } from "./state/tasks";
import {
  startUpdateChecks,
  updates,
  checkUpdate,
  showUpdate,
  updateVisible,
} from "./state/updates";
import { onboarding } from "./state/onboarding";
import { navigation, resolvePage, type Page } from "./state/navigation";
import { panelLayers, panelAnchorAt } from "./state/panels";
import {
  capturePanelOrigin,
} from "./components/panelMorph";
import { displayMessage } from "./messages";
import OAuthApproval from "./components/OAuthApproval";
import ConnectionOverview from "./components/ConnectionOverview";
import ConnectionsPage from "./components/ConnectionsPage";
import RecordsPage from "./components/RecordsPage";
import SettingsPage from "./components/SettingsPage";
import { usePrivacy } from "./state/privacy";
import { UpdateDock, UpdateOutcome } from "./components/AppUpdate";
import { Button, Icon, IconButton, Notice, HoverScope } from "./components/ui";
import { api } from "./api";
import { startPermissions } from "./state/permissions";
const NavigationFixture = import.meta.env.DEV && scenarioName === "navigation-redirects" ? (await import("./scenarioNavigation")).default : undefined;
export default function App() {
  locale.use();
  const privateMode = usePrivacy();
  useLayoutEffect(() => { document.documentElement.dataset.privacy = String(privateMode); }, [privateMode]);
  const nav = navigation.use();
  const [oauthRequest, setOauthRequest] = useState<{ id: string }>();
  const { feedback, status } = connector.use();
  updates.use();
  const [page, setPage] = useState<Page>(() => resolvePage(localStorage.getItem("arc-page")));
  const [sheetWide, setSheetWide] = useState(false);
  const sheet = useRef<HTMLElement>(null),
    lastPage = useRef<Page>(page === "overview" ? "logs" : page),
    sheetClosing = useRef(false),
    backdropDown = useRef(false);
  const welcome = onboarding.use()?.step === "welcome" && page === "overview";
  const layers = panelLayers.use();
  const modalOpen = layers.some(layer => !layer.dataset.panelDock);
  useEffect(() => { localStorage.setItem("arc-page", page); }, [page]);
  useEffect(() => {
    if (!isDesktop) return;
    // Keep drafts and active dialogs alive; only retire an idle hidden surface.
    const timer = setInterval(() => {
      if (document.querySelector('[role="dialog"], form') || updates.get().snapshot.state !== "idle" || updates.get().panelOpen || updateVisible()) return;
      void import("@tauri-apps/api/core").then(({ invoke }) => invoke("release_main_window")).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    if (page === "overview" || !sheet.current) return;
    const animation = reducedMotion() ? undefined : animate(sheet.current,
      { opacity: [0, 1], transform: ["translateY(6px)", "translateY(0)"] }, { duration: 0.16 });
    document.querySelector<HTMLElement>(".capsule-title")?.focus({ preventScroll: true });
    return () => animation?.stop();
  }, [page]);

  async function closeSheet(replacement?: HTMLElement) {
    const node = sheet.current;
    if (!node || sheetClosing.current) return;
    sheetClosing.current = true;
    if (!reducedMotion() && !replacement)
      await animate(node, { opacity: 0, transform: "translateY(6px)" }, { duration: 0.14 });
    sheetClosing.current = false;
    setPage("overview");
    requestAnimationFrame(() => {
      const target =
        replacement ??
        document.querySelector<HTMLElement>(
          `[data-page="${lastPage.current}"]`,
        );
      target?.focus({ preventScroll: true });
      if (replacement) replacement.click();
    });
  }

  useEffect(() => {
    if (!nav.page) return;
    navigate(nav.page);
    navigation.set(old => ({ ...old, page: undefined }));
  }, [nav.page]);

  function navigate(target: string) {
    const next = resolvePage(target);
    if (next !== "overview") {
      lastPage.current = next;
      setSheetWide(false);
    }
    setPage(next);
  }
  useEffect(() => {
    if (scenarioName) return;
    const stops = [
      startConnector(),
      startPermissions(),
      startSubscriptions(),
      startAgentActivity(),
      startAgents(),
      startTasks(),
      startUpdateChecks(),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);
  useEffect(() => {
    if (!isDesktop) return;
    let stopped = false;
    const stops: (() => void)[] = [];
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const listeners = await Promise.all([
        listen<{ id: string; panel?: PanelRequest }>("acceptance:snapshot", e => { void captureRequest(e.payload, () => navigate("overview")); }),
        listen<string>("oauth:open", (e) => setOauthRequest({ id: e.payload })),
        listen("ingress:edit", () => navigate("connections")),
        listen("permissions:open", () => navigate("settings")),
        listen("codex:login", () => { void api("codex/login", "POST").catch((e: Error) => notify(e.message, true)); }),
        listen("updates:check", () => {
          showUpdate();
          void checkUpdate();
        }),
        listen<string>("navigate", (e) => {
          if (["overview", "settings", "logs", "connections", "tasks", "remote", "accounts", "permissions"].includes(e.payload))
            navigate(e.payload);
        }),
        listen<string>("subscriptions:open", (e) => {
          navigation.set((old) => ({ ...old, providerId: e.payload }));
          navigate("overview");
        }),
        listen<string>("connection-error", (e) => notify(e.payload, true)),
      ]);
      if (stopped) listeners.forEach((stop) => stop());
      else {
        stops.push(...listeners);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("main_window_ready");
      }
    });
    return () => {
      stopped = true;
      stops.forEach((stop) => stop());
    };
  }, []);
  useEffect(() => {
    const handle = (event: Event) => {
      const url = new URL((event as CustomEvent<string>).detail);
      if (url.hostname === "ingress") navigate("connections");
      else if (url.hostname === "oauth") setOauthRequest({ id: url.searchParams.get("request") ?? "" });
      else if (["overview", "tasks", "accounts", "remote", "connections", "permissions", "settings", "logs"].includes(url.hostname)) navigate(url.hostname);
      else if (url.hostname === "setup" && ["claude-login", "cloudflare-login"].includes(url.searchParams.get("target") ?? "")) {
        void api("setup/apply", "POST", {stepId: url.searchParams.get("target") === "claude-login" ? "claude-code-ready" : "cloudflare-login", input:{}}).catch((e: Error) => notify(e.message, true));
      }
      else if (url.hostname === "setup" && url.searchParams.get("target") === "codex-login") {
        void api("codex/login", "POST").catch((e: Error) => notify(e.message, true));
      }
    };
    window.addEventListener("arc:open-url", handle);
    return () => window.removeEventListener("arc:open-url", handle);
  }, []);
  const pages = [
    { id: "logs" as const, label: t("logs"), icon: Logs },
    { id: "connections" as const, label: t("source.connections"), icon: Network },
    { id: "settings" as const, label: t("settings"), icon: Settings },
  ];
  return (
    <div
      className={`app-scene relative h-dvh min-h-0 overflow-hidden bg-background [--sheet-inset:--spacing(5)] [--sheet-top:--spacing(5)] max-[600px]:[--sheet-inset:--spacing(3)] max-[600px]:[--sheet-top:--spacing(3)] [&.desktop]:[--sheet-top:--spacing(12)] ${sheetWide ? "sheet-wide" : ""} ${isDesktop ? "desktop" : ""} ${isDesktop && navigator.platform.toLowerCase().includes("mac") ? "mac" : ""}`}
      onClickCapture={(e) => capturePanelOrigin(e.target)}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !e.defaultPrevented &&
          page !== "overview" &&
          !layers.length
        ) {
          e.preventDefault();
          if (page === "settings" && (nav.settingsUpdates || nav.settingsPermissions)) {
            navigation.set(old => ({ ...old, settingsUpdates: undefined, settingsPermissions: undefined }));
          } else void closeSheet();
        }
        if (e.key === "Tab" && page !== "overview" && !layers.length) {
          const nodes = Array.from(
            document.querySelectorAll<HTMLElement>(
              '.page-sheet button:not(:disabled),.page-sheet input:not(:disabled),.page-sheet [tabindex="0"],.navigation-capsule .capsule-close',
            ),
          ).filter((n) => n.getClientRects().length && !n.closest("[inert]"));
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          if (
            (e.shiftKey && index <= 0) ||
            (!e.shiftKey && index === nodes.length - 1)
          ) {
            e.preventDefault();
            (e.shiftKey ? nodes.at(-1) : nodes[0])?.focus();
          }
        }
      }}
    >
      {NavigationFixture && <NavigationFixture page={page} navigate={navigate} />}
      {isDesktop && (
        <div className="window-drag-strip absolute inset-x-0 top-0 z-60 flex h-9.5 justify-end" data-tauri-drag-region />
      )}
      <main
        className="home-workspace h-full overflow-hidden pb-24"
        inert={page !== "overview" || modalOpen}
      >
        <ConnectionOverview visible={page === "overview"} />
      </main>
      {page !== "overview" && (
        <div
          className="sheet-backdrop absolute inset-0 z-28 bg-transparent"
          onPointerDown={(e) =>
            (backdropDown.current =
              e.button === 0 && e.target === e.currentTarget)
          }
          onPointerCancel={() => (backdropDown.current = false)}
          onClick={(e) => {
            if (
              backdropDown.current &&
              e.target === e.currentTarget &&
              !layers.length
            )
              void closeSheet(panelAnchorAt(e.clientX, e.clientY));
            backdropDown.current = false;
          }}
        />
      )}
      <div
        hidden={welcome}
        style={{ width: updateVisible() ? 176 : 128, maxWidth: "calc(100vw - 32px)" }}
        className={`navigation-surface absolute bottom-6 left-6 z-49 pointer-events-none h-12.5 rounded-full border border-brand-accent/15 bg-background shadow-overlay max-[600px]:bottom-4 max-[600px]:left-4 [&.expanded]:invisible [&.expanded]:pointer-events-none [&[hidden]]:hidden ${page !== "overview" ? "expanded" : ""} ${updateVisible() ? "has-update" : ""}`}
        aria-hidden="true"
      />
      {page !== "overview" && (
        <section
          ref={sheet}
          style={{ top: "var(--sheet-top)", bottom: "var(--sheet-inset)", left: "var(--sheet-inset)", width: sheetWide ? "calc(100vw - 2 * var(--sheet-inset))" : "min(960px, calc(100vw - 2 * var(--sheet-inset)))" }}
          className="page-sheet absolute z-30 flex flex-col overflow-hidden rounded-workspace border border-transparent bg-background shadow-overlay origin-top-left data-recessed:invisible data-recessed:pointer-events-none"
          data-panel-depth="1"
          data-recessed={modalOpen || undefined}
          inert={modalOpen}
          aria-label={pages.find((item) => item.id === page)?.label}
        >
          <div style={{ width: sheetWide ? "calc(100vw - 2 * var(--sheet-inset) - 2px)" : "min(958px, calc(100vw - 2 * var(--sheet-inset) - 2px))", height: "calc(100dvh - var(--sheet-top) - var(--sheet-inset) - 2px)" }} className="page-sheet-content relative flex min-h-0 flex-none flex-col self-center">
            <header className="sheet-header flex shrink-0 items-center gap-3 border-b px-3 py-2 pl-6.625 min-h-13 max-[600px]:pl-4">
              {page === "settings" && (nav.settingsUpdates || nav.settingsPermissions) && <IconButton icon={ArrowLeft} label={t("back")} onClick={() => navigation.set(old => ({ ...old, settingsUpdates: undefined, settingsPermissions: undefined }))} />}
              <h1 className="capsule-title m-0 min-w-0 flex-1 text-lg font-semibold outline-none" tabIndex={-1}>
                {pages.find((item) => item.id === page)?.label}
                {page === "settings" && (nav.settingsUpdates || nav.settingsPermissions) && <><span className="settings-breadcrumb-divider mx-2 font-normal text-muted-foreground" aria-hidden="true"> / </span><span>{t(nav.settingsUpdates ? "appUpdates" : "permissionsSystem")}</span></>}
                {page === "logs" && (
                  <span className="muted text-muted-foreground small text-xs records-count ml-3 whitespace-nowrap font-normal">
                    {t("recentRecords", { count: status?.logs.length ?? 0 })}
                  </span>
                )}
              </h1>
              <IconButton
                className="panel-width-toggle hidden min-[1000px]:inline-flex"
                icon={sheetWide ? Minimize2 : Maximize2}
                label={t(sheetWide ? "restorePanelWidth" : "expandPanelWidth")}
                aria-pressed={sheetWide}
                onClick={() => setSheetWide(!sheetWide)}
              />
              <IconButton
                className="capsule-close size-8 rounded-full"
                icon={X}
                label={t("backToHome")}
                onClick={() => void closeSheet()}
              />
            </header>
            <main
              className={`workspace min-h-0 w-full max-w-none flex-1 m-0 overflow-auto overscroll-contain px-6.625 py-6 max-[600px]:px-4 max-[600px]:py-5 [&>.settings-page]:m-0 [&>.settings-page]:w-full [&>.settings-page]:max-w-none ${page === "logs" ? "records-workspace pb-6" : ""}`}
            >
              {page === "logs" ? <RecordsPage /> : page === "connections" ? <ConnectionsPage /> : <SettingsPage />}

            </main>

          </div>
        </section>
      )}
      <nav
        style={{ width: updateVisible() ? 176 : 128, maxWidth: "calc(100vw - 32px)" }}
        className={`navigation-capsule absolute bottom-6 left-6 z-50 block h-12.5 rounded-full border border-transparent bg-transparent max-[600px]:bottom-4 max-[600px]:left-4 [&.expanded]:invisible [&.expanded]:pointer-events-none [&[hidden]]:hidden ${page !== "overview" ? "expanded" : ""} ${updateVisible() ? "has-update" : ""}`}
        inert={welcome || page !== "overview" || modalOpen}
        aria-hidden={welcome || page !== "overview"}
        hidden={welcome}
        aria-label={t("mainNavigation")}
      >
        <HoverScope
          activeKey={page !== "overview" || modalOpen ? "" : undefined}
          className="capsule-icons absolute inset-0 flex items-center gap-1 overflow-hidden rounded-full p-1.5 [&_button]:relative [&_button]:grid [&_button]:size-9 [&_button]:shrink-0 [&_button]:place-items-center [&_button]:rounded-full [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-2 [&_button]:text-foreground [&_button]:shadow-none [&_button]:transition-opacity [&_button]:duration-150 [&_svg]:size-5"
          inert={page !== "overview"}
          aria-hidden={page !== "overview"}
        >
          {pages.map((item) => (
            <Button variant="surface"
              key={item.id}
              data-panel-anchor
              data-page={item.id}
              data-hover-target={item.id}
              aria-label={item.label}
              onClick={() => navigate(item.id)}
            >
              <Icon icon={item.icon} size={20} />
            </Button>
          ))}
          <UpdateDock />
        </HoverScope>
      </nav>
      {feedback.text && (
        <div style={{ maxHeight: "40dvh" }} className="app-feedback absolute inset-x-6 top-12 z-140 mx-auto w-auto max-w-190 rounded-lg shadow-overlay overflow-auto">
          <Notice
            tone={feedback.error ? "danger" : "success"}
            action={
              <>{feedback.copy && <Button onClick={() => void copyText(feedback.copy!).catch(() => notify(t("connect.actionFailed"), true))}>{t("copy")}</Button>}<IconButton
                icon={X}
                label={t("dismissMessage")}
                onClick={() => notify("")}
              /></>
            }
          >
            {displayMessage(feedback.text)}
          </Notice>
        </div>
      )}
      <UpdateOutcome />
      <OAuthApproval inlineEnabled={page === "overview"} requested={oauthRequest} onClose={() => setOauthRequest(undefined)} />
    </div>
  );
}
