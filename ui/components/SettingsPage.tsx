import { navigation } from "../state/navigation";
import { notificationsPreference } from "../state/store";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { t, language, languageOptions, setLanguage } from "../i18n";
import { theme, type Theme } from "../theme";
import { api } from "../api";
import { isDesktop } from "../platform";
import { connector, run, notify, refreshConnector } from "../state/connector";
import { useInterval } from "../state/hooks";
import type { Service } from "../state/types";
import { SettingsSection, SettingRow, Switch, ChoiceControl } from "./ui";
import SystemPermissions from "./SystemPermissions";
import { AppUpdate, UpdatesSettings } from "./AppUpdate";
export default function SettingsPage() {
  const { status, busy } = connector.use();
  const { settingsUpdates, settingsPermissions } = navigation.use();
  const previousSettings = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (settingsUpdates || settingsPermissions) {
      document.querySelector<HTMLElement>(".capsule-title")?.focus({ preventScroll: true });
      document.querySelector(".workspace")?.scrollTo({ top: 0 });
    } else if (previousSettings.current) {
      document.getElementById(previousSettings.current)?.focus();
    }
    previousSettings.current = settingsPermissions ? "settings-permissions-entry" : settingsUpdates ? "settings-updates-entry" : undefined;
  }, [settingsUpdates, settingsPermissions]);
  const currentTheme = theme.use(),
    currentLanguage = language.use();
  const [appearance, setAppearance] = useState({
      showMenuBar: true,
      showDock: true,
    }),
    [appearanceReady, setAppearanceReady] = useState(false),
    [service, setService] = useState<Service>();
  const notifications = notificationsPreference.use();
  const mac = isDesktop && navigator.platform.toLowerCase().includes("mac");
  useEffect(() => {
    if (mac)
      void api<typeof appearance>("appearance")
        .then((value) => {
          setAppearance(value);
          setAppearanceReady(true);
        })
        .catch((e) => notify(String(e), true));
  }, [mac]);
  useInterval(
    () => {
      void api<Service>("service")
        .then(setService)
        .catch(() => {});
    },
    5000,
    true,
  );
  async function saveTask(patch: {
    enabled?: boolean;
    autoOpenCodex?: boolean;
    notificationsEnabled?: boolean;
  }) {
    await run("task-settings", async () => {
      await api("task-settings", "PUT", patch);
      await refreshConnector();
    });
  }
  if (settingsUpdates) return <UpdatesSettings />;
  if (settingsPermissions) return <SystemPermissions />;
  return (
    <div className="settings-page mx-auto w-full min-w-0 max-w-3xl">
      <SettingsSection title={t("behavior")}>
        <SettingRow label={t("controlSourceNotifications")} description={t("controlSourceNotificationsDescription")}>
          <Switch label={t("controlSourceNotifications")} checked={status?.notificationsEnabled !== false}
            disabled={!!busy || !status} onChange={(value) => void saveTask({ notificationsEnabled: value })} />
        </SettingRow>
        <SettingRow
          label={t("automaticallyOpenCodexTasks")}
          description={t("whenDisabledNewTasksRunInTheBackground")}
        >
          <Switch
            label={t("automaticallyOpenCodexTasks")}
            checked={status?.autoOpenCodex !== false}
            disabled={!!busy || !status}
            onChange={(value) => void saveTask({ autoOpenCodex: value })}
          />
        </SettingRow>
        <SettingRow
          label={t("taskApprovalMode")}
          description={t("askForConfirmationByDefaultTheCloudCan")}
        >
          <Switch
            label={t("taskApprovalMode")}
            checked={!!status?.taskApprovalEnabled}
            disabled={!!busy || !status}
            onChange={(value) => void saveTask({ enabled: value })}
          />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t("general")}>
        <SettingRow label={t("connectAtSystemSignIn")}>
          <Switch
            label={t("connectAtSystemSignIn")}
            checked={!!service?.enabled}
            disabled={!!busy || !service?.supported}
            onChange={(enabled) =>
              void run("startup", async () =>
                setService(await api<Service>("service", "POST", { enabled })),
              )
            }
          />
        </SettingRow>
        {isDesktop && (
          <SettingRow label={t("connectionNotifications")} description={t("connectionNotificationsDescription")}>
            <Switch
              label={t("connectionNotifications")}
              checked={notifications}
              onChange={(value) => {
                notificationsPreference.set(value);
              }}
            />
          </SettingRow>
        )}
        <SettingRow label={t("language")}>
          <ChoiceControl
            value={currentLanguage}
            onChange={setLanguage}
            label={t("language")}
            options={languageOptions.map(option => option.value === "auto" ? { ...option, label: t("system") } : option)}
          />
        </SettingRow>
        <SettingRow label={t("appearance")}>
          <ChoiceControl
            value={currentTheme}
            onChange={(value) => theme.set(value as Theme)}
            label={t("appearance")}
            options={[
              { value: "system", label: t("system"), icon: Monitor },
              { value: "light", label: t("light"), icon: Sun },
              { value: "dark", label: t("dark"), icon: Moon },
            ]}
          />
        </SettingRow>
        {mac && (
          <SettingRow label={t("showAppIn")}>
            <ChoiceControl
              value={
                appearance.showMenuBar
                  ? appearance.showDock
                    ? "all"
                    : "menu"
                  : "dock"
              }
              disabled={!!busy || !appearanceReady}
              label={t("showAppIn")}
              onChange={(position) =>
                void run("appearance", async () =>
                  setAppearance(
                    await api<typeof appearance>("appearance", "PUT", {
                      showMenuBar: position !== "dock",
                      showDock: position !== "menu",
                    }),
                  ),
                )
              }
              options={[
                { value: "all", label: t("all") },
                { value: "menu", label: t("menuBarOnly") },
                { value: "dock", label: t("dockOnly") },
              ]}
            />
          </SettingRow>
        )}
      </SettingsSection>
      <SettingRow id="settings-permissions-entry" label={t("permissionsSystem")} onNavigate={() => navigation.set(old => ({ ...old, settingsPermissions: true }))} />
      <AppUpdate />
    </div>
  );
}
