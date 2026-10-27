import { t } from "../i18n";
import { topologyTuningEnabled } from "../state/topology";
import { SettingsSection, SettingRow, Switch } from "./ui";
import { api } from "../api";
import { connector, run } from "../state/connector";
import { acceptPreferences, maintainerMode } from "../state/store";

export default function SettingsExtras() {
  const tuning = topologyTuningEnabled.use();
  const maintainer = maintainerMode.use(), { busy, status } = connector.use();
  async function saveMaintainer(enabled: boolean) {
    await run("maintainer-mode", async () => {
      acceptPreferences(await api<Record<string, string>>("preferences", "PUT", {
        values: { "maintainer-mode": enabled ? "on" : "off" },
      }));
    });
  }
  return <SettingsSection title={t("topology.experimental")}>
          <SettingRow label={t("extras.maintainerMode")}>
            <Switch label={t("extras.maintainerMode")} checked={maintainer} disabled={!!busy || !status} onChange={saveMaintainer} />
          </SettingRow>
          <SettingRow label={t("topology.tuning")} description={t("topology.settingDescription")}>
            <Switch label={t("topology.tuning")} checked={tuning} onChange={topologyTuningEnabled.set} />
          </SettingRow>
        </SettingsSection>;
}
