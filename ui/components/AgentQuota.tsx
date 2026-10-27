import { locale, t } from "../i18n";
import { useNow } from "../state/hooks";
import { agentQuotaWindows } from "../subscriptions/QuotaRing";
import { quotaDisplay, quotaLabel, quotaPercent, quotaValue, resetDisplay } from "../subscriptions/displayPreferences";
import { windowLabel } from "../subscriptions/labels";
import { quotaPeriod } from "../subscriptions/quotaTiming";
import { compactAge, compactReset, preciseTime, quotaColor } from "../subscriptions/presentation";
import { quotaPace } from "../subscriptions/pace";
import type { ProviderSnapshot } from "../subscriptions/types";
import { Button, Freshness } from "./ui";
import { Card } from "./ui/card";
import UsageHistory from "../subscriptions/UsageHistory";
import ResetCreditDetails from "../subscriptions/ResetCreditDetails";

export default function AgentQuota({ provider, onRefresh, refreshing }: { provider: ProviderSnapshot; onRefresh: () => void; refreshing: boolean }) {
  const now = useNow();
  locale.use();
  const display = quotaDisplay.use(), reset = resetDisplay.use();
  const { short, weekly } = agentQuotaWindows(provider);
  const selected = [short, weekly].filter(window => window !== undefined);
  const windows = selected.length ? selected : provider.windows.filter(window => Number.isFinite(window.usedPercent)).slice(0, 2);
  const pace = windows.map(window => quotaPace(window, provider, now));
  const age = compactAge(provider.observedAt, now);
  const summaryWindow = weekly ?? windows[0];
  if (!windows.length) return <p className="m-0 text-xs text-muted-foreground">{t("agentPanel.noQuota")}</p>;
  return <section className="agent-quota-block @container flex shrink-0 flex-col gap-1" aria-label={t("agentQuotaGroup")}>
    <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
      {windows.map((window, index) => {
        const resetAt = Date.parse(window.resetsAt ?? "");
        const period = quotaPeriod(window, provider);
        const elapsed = period && Number.isFinite(resetAt) && now < resetAt && now >= resetAt - period
          ? (now - resetAt + period) / period : undefined;
        const tick = elapsed === undefined ? undefined : (display === "remaining" ? 1 - elapsed : elapsed) * 100;
        const label = windowLabel(window.label), value = quotaValue(window);
        const resetText = reset === "time" && Number.isFinite(resetAt) ? preciseTime(window.resetsAt) : compactReset(window.resetsAt, now);
        return <Card className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-muted p-3 shadow-none only:col-span-full" key={window.id}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground [&>span:first-child]:truncate [&>span:first-child]:font-medium"><span title={window.scope}>{label}</span>
            <time className="ml-auto min-w-0 tabular-nums wrap-anywhere" dateTime={Number.isFinite(resetAt) ? window.resetsAt : undefined}
              title={Number.isFinite(resetAt) ? t("quotaResetAt", { time: preciseTime(window.resetsAt) }) : t("quotaResetUnknown")}
              aria-label={t(reset === "time" ? "quotaResetAt" : "quotaResetIn", { time: resetText })}>{resetText}</time>
            {window === summaryWindow && <Freshness className="gap-1 text-xs text-muted-foreground [&>.icon-button]:size-5 [&>.icon-button]:min-h-5 [&>.icon-button]:min-w-5 [&>.icon-button]:p-0.5" observedAt={provider.observedAt} age={age}
              timestampLabel={preciseTime(provider.observedAt)} label={t("agentPanel.updated", { time: age })}
              stale={provider.state === "stale"} onRefresh={onRefresh} refreshLabel={t("usageRefresh")}
              busy={refreshing || provider.refreshing} disabled={!provider.eligible} />}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <strong className="shrink-0 text-3xl leading-none font-semibold tracking-tight tabular-nums" aria-label={`${label} · ${quotaLabel()} ${quotaPercent(window)}`}>{quotaPercent(window)}</strong>
            {pace[index]?.label && <span className="min-w-0 flex-1 text-xs text-warning" title={pace[index]?.tooltip}>{pace[index]?.label}</span>}
            {window === summaryWindow && (Number.isFinite(provider.creditBalance) || provider.availableResetCount != null) && <div className="flex shrink-0 flex-col items-end text-right text-xs text-muted-foreground tabular-nums">
              {Number.isFinite(provider.creditBalance) && <span>{Math.ceil(provider.creditBalance!)} credits</span>}
              {provider.availableResetCount != null && <UsageHistory detail={() => <ResetCreditDetails credits={provider.resetCredits} now={now} />}>
                {({ register, hover, focus, expanded }) => <Button variant="ghost" className="h-auto min-h-0 rounded-sm border-0 p-0 text-inherit"
                  ref={node => register("resets", node)}
                  onPointerEnter={event => event.pointerType !== "touch" && hover("resets")}
                  onPointerLeave={event => event.pointerType !== "touch" && hover("")}
                  onClick={() => focus("resets")} onFocus={() => focus("resets")} onBlur={() => focus("")}
                  aria-expanded={expanded}>
                  {provider.availableResetCount} {provider.availableResetCount === 1 ? "reset" : "resets"}
                </Button>}
              </UsageHistory>}
            </div>}
          </div>
          <div className="relative h-1.5 rounded-full bg-border" role="meter" aria-label={`${label} · ${quotaLabel()}`}
            title={pace[index]?.tooltip}
            aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-150" style={{ width: `${value}%`, background: pace[index]?.color ?? quotaColor(window, provider, now) }} />
            {tick !== undefined && <span className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-xs bg-muted-foreground" role="img" aria-label={t("quotaTimeTick")}
              title={t("quotaTimeTick")} style={{ left: `clamp(1px, ${tick}%, calc(100% - 1px))` }} />}
          </div>
        </Card>;
      })}
    </div>
  </section>;
}
