import { Bot } from "lucide-react";
import { t } from "../i18n";
import { icons } from "../state/agents";
import { subscriptions } from "../state/subscriptions";
import { agentActivity } from "../state/activity";
import { useNow } from "../state/hooks";
import {
  quotaDisplay,
  quotaLabel,
  quotaValue,
  quotaPercent,
} from "./displayPreferences";
import { readingStatus, brandIcon, quotaColor } from "./presentation";
import { windowLabel } from "./labels";
import { quotaPace } from "./pace";
import type { ProviderSnapshot, QuotaWindow } from "./types";
export function ActivityArc({ attention = false }: { attention?: boolean }) {
  return (
    <svg
      className={`activity-arc ${attention ? "needs-attention" : ""}`}
      viewBox="0 0 48 48"
      role="img"
      aria-label={t(attention ? "activity.needsAttention" : "agentTaskRunning")}
    >
      <circle cx="24" cy="24" r="16" pathLength="100" strokeDasharray="33 67" />
    </svg>
  );
}
function TimeTick({
  provider,
  window,
  center,
  radius,
}: {
  provider: ProviderSnapshot;
  window?: QuotaWindow;
  center: number;
  radius: number;
}) {
  const now = useNow();
  quotaDisplay.use();
  const tick = window ? quotaPace(window, provider, now)?.tick : undefined;
  return tick == null ? null : (
    <line
      className="quota-time-tick"
      x1={center}
      x2={center}
      y1={center - radius - 2}
      y2={center - radius + 2}
      transform={`rotate(${tick * 3.6} ${center} ${center})`}
      aria-hidden="true"
    />
  );
}
export function AgentQuotaIcon({ agent }: { agent: string }) {
  const { snapshot } = subscriptions.use();
  const now = useNow();
  quotaDisplay.use();
  const provider = snapshot?.settings.enabled
    ? snapshot.providers.find(
        (p) => p.agentIds.includes(agent) && p.eligible,
      )
    : undefined;
  const windows =
    provider && ["ready", "stale"].includes(provider.state)
      ? provider.windows.filter(
          (w) =>
            Number.isFinite(w.usedPercent) &&
            (!w.resetsAt || Date.parse(w.resetsAt) > now),
        )
      : [];
  const current = windows.find((w) => w.id === provider?.displayWindowId),
    label = current
      ? `${windowLabel(current.label)} · ${quotaLabel()} ${quotaPercent(current)}`
      : undefined;
  return (
    <span
      className={`agent-quota-icon ${current ? "has-quota" : ""}`}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {current && provider && (
        <svg className="quota-outline" viewBox="0 0 48 48" aria-hidden="true">
          <circle className="quota-track" cx="24" cy="24" r="21" />
          <circle
            cx="24"
            cy="24"
            r="21"
            pathLength="100"
            stroke={readingStatus(current, provider, now).color}
            strokeDasharray={`${quotaValue(current)} 100`}
            transform="rotate(-90 24 24)"
          />
          <TimeTick
            provider={provider}
            window={current}
            center={24}
            radius={21}
          />
        </svg>
      )}
      {icons[agent] ? (
        <span
          className="agent-logo"
          dangerouslySetInnerHTML={{ __html: icons[agent] }}
          aria-hidden="true"
        />
      ) : (
        <Bot className="agent-logo" aria-hidden="true" />
      )}
    </span>
  );
}
export default function QuotaRing({
  provider,
  showPercentage = true,
}: {
  provider: ProviderSnapshot;
  showPercentage?: boolean;
}) {
  const now = useNow();
  quotaDisplay.use();
  const activity = agentActivity.use().snapshot;
  const current = provider.windows.find(
      (w) => w.id === provider.displayWindowId,
    ),
    value = quotaValue(current),
    sessions = provider.agentIds.flatMap(id => activity?.agents[id]?.sessions ?? []),
    running = sessions.length > 0,
    attention = sessions.some(session => session.interaction);
  return (
    <span
      className={`quota-ring ${provider.state === "stale" ? "stale" : ""}`}
      aria-busy={running}
    >
      <span className="quota-dial">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="18" className="track" />
          {value !== undefined && (
            <circle
              cx="18"
              cy="18"
              r="18"
              className="value"
              pathLength="100"
              transform="rotate(-90 18 18)"
              stroke={quotaColor(current, provider, now)}
              strokeDasharray={`${Math.max(0, Math.min(100, (value ?? 0)!))} 100`}
            />
          )}
          <TimeTick
            provider={provider}
            window={current}
            center={18}
            radius={18}
          />
        </svg>
        {running && <ActivityArc attention={attention} />}
        <img src={brandIcon(provider.agentId)} alt="" />
      </span>
      {showPercentage && (
        <span
          className="quota-number"
          aria-label={`${quotaLabel()} ${quotaPercent(current)}`}
        >
          {quotaPercent(current)}
        </span>
      )}
    </span>
  );
}
