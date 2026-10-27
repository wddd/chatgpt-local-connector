import { useState } from "react";
import { t } from "../i18n";
import { subscriptions, saveSubscriptions } from "../state/subscriptions";
import {
  quotaDisplay, topologyLayout, type LayoutPreference,
  resetDisplay,
  maxVisibleAgents,
  bubbleDensity, bubbleWidth, bubbleAutoCompact,
} from "../subscriptions/displayPreferences";
import { bubbleWidths, bubbleHeights, type BubbleDensity, type BubbleWidth } from "../state/activityModel";
import { ActivityBubbleContent } from "./ActivityBubbles";
import type { CSSProperties } from "react";
import {
  Dialog,
  SettingsSection,
  SettingRow,
  Notice,
  ChoiceControl,
  Switch,
} from "./ui";
export default function AgentDisplaySettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const { snapshot } = subscriptions.use(),
    layout = topologyLayout.use(), quota = quotaDisplay.use(),
    reset = resetDisplay.use(),
    max = maxVisibleAgents.use(), density = bubbleDensity.use(), width = bubbleWidth.use(), autoCompact = bubbleAutoCompact.use();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function save(action: () => Promise<unknown>) {
    setSaving(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title={t("agentDisplaySettings")} onClose={onClose} busy={saving}>
      {error && <Notice>{error}</Notice>}
      <SettingsSection title={t("activity.bubbleSettings")}>
        <div className="activity-preview grid place-items-center overflow-hidden pt-3 pb-5" aria-label={t("activity.preview")}>
          <div className="activity-bubble" data-density={density} style={{ "--bubble-width": `${bubbleWidths[width]}px`, "--bubble-height": `${bubbleHeights[density]}px` } as CSSProperties}>
            <ActivityBubbleContent agent="codex" density={density} now={83000} session={{ id: "preview", source: "arc-task", title: t("activity.previewTitle"), phase: "command", headline: "npm run check", phaseSince: null,
              turnStartedAt: "1970-01-01T00:00:00Z", timeline: false, orderAt: 0, project: "/workspace/arc", recentContent: [t("activity.previewPrevious"), "npm run check"], recentSteps: ["thinking", "file", "command"],
              dispatchSummary: { model: "gpt-6.1-sol", effort: "high", serviceTier: "priority", controlSource: { kind: "claude", label: "Claude" } },
            }} />
          </div>
        </div>
        <SettingRow label={t("activity.density")}><ChoiceControl label={t("activity.density")} value={density} onChange={value => bubbleDensity.set(value as BubbleDensity)}
          options={Object.keys(bubbleHeights).map(value => ({ value, label: t(`activity.density.${value}`) }))} /></SettingRow>
        <SettingRow label={t("activity.width")}><ChoiceControl label={t("activity.width")} value={width} onChange={value => bubbleWidth.set(value as BubbleWidth)}
          options={Object.keys(bubbleWidths).map(value => ({ value, label: t(`activity.width.${value}`) }))} /></SettingRow>
        <SettingRow label={t("activity.autoCompact")} description={t("activity.autoCompactHint")}><Switch label={t("activity.autoCompact")} checked={autoCompact} onChange={bubbleAutoCompact.set} /></SettingRow>
      </SettingsSection>
      <SettingsSection title={t("usageAppearance")}>
        <SettingRow label={t("topology.layout")}><ChoiceControl label={t("topology.layout")} value={layout}
          onChange={value => topologyLayout.set(value as LayoutPreference)}
          options={['auto', 'landscape', 'portrait'].map(value => ({ value, label: t(`topology.layout.${value}`) }))} /></SettingRow>
        <SettingRow label={t("agentsMaxVisible")}>
          <ChoiceControl
            value={String(max)}
            onChange={(value) => maxVisibleAgents.set(Number(value))}
            label={t("agentsMaxVisible")}
            options={["4", "6", "8", "10"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t("agentQuotaGroup")}>
        <SettingRow label={t("usageEnabled")}>
          <Switch label={t("usageEnabled")} checked={!!snapshot?.settings.enabled}
            disabled={saving || !snapshot}
            onChange={(enabled) => void save(() => saveSubscriptions({ enabled }))} />
        </SettingRow>
        <SettingRow label={t("agentQuotaDisplay")}>
          <ChoiceControl
            value={quota}
            onChange={(value) =>
              quotaDisplay.set(value as "remaining" | "used")
            }
            label={t("agentQuotaDisplay")}
            options={[
              { value: "remaining", label: t("usageRemaining") },
              { value: "used", label: t("usageUsed") },
            ]}
          />
        </SettingRow>
        <SettingRow label={t("agentResetDisplay")}>
          <ChoiceControl
            value={reset}
            onChange={(value) =>
              resetDisplay.set(value as "countdown" | "time")
            }
            label={t("agentResetDisplay")}
            options={[
              { value: "countdown", label: t("usageCountdown") },
              { value: "time", label: t("usageResetTime") },
            ]}
          />
        </SettingRow>
        <SettingRow label={t("usageAutoRefresh")}>
          <ChoiceControl
            value={String(snapshot?.settings.refreshMinutes ?? 3)}
            onChange={(value) =>
              void save(() =>
                saveSubscriptions({ refreshMinutes: Number(value) }),
              )
            }
            label={t("usageAutoRefresh")}
            disabled={saving || !snapshot}
            options={["1", "3", "5", "10"].map((value) => ({
              value,
              label: `${value} min`,
            }))}
          />
        </SettingRow>
      </SettingsSection>
    </Dialog>
  );
}
