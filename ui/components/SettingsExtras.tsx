import { useState } from "react";
import { t } from "../i18n";
import { topologyTuningEnabled } from "../state/topology";
import { Group, HoverScope, Row, SingleChoice, Switch } from "./ui";
import RelayHosting from "./RelayHosting";

export default function SettingsExtras() {
  const [pane, setPane] = useState("hosting"), tuning = topologyTuningEnabled.use();
  return <div className="settings-extras">
    <div className="extras-layout">
      <aside className="extras-nav">
        <HoverScope><SingleChoice navigation label={t("extras.title")} value={pane} onChange={setPane} options={[
          { value: "hosting", label: t("extras.hosting"), description: t("extras.hostingDescription") },
          { value: "experimental", label: t("topology.experimental"), description: t("extras.experimentalDescription") },
        ]} /></HoverScope>
      </aside>
      <div className="extras-content">
        {pane === "hosting" ? <RelayHosting /> : <Group title={t("topology.experimental")}>
          <Row title={t("topology.tuning")} description={t("topology.settingDescription")}>
            <Switch label={t("topology.tuning")} checked={tuning} onChange={topologyTuningEnabled.set} />
          </Row>
        </Group>}
      </div>
    </div>
  </div>;
}
