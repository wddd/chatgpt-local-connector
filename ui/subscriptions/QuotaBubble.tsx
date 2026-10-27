import { useSensitiveText } from "../components/Sensitive";
import { useState } from "react";
import { TriangleAlert, CircleAlert, Flame } from "lucide-react";
import { t, locale } from "../i18n";
import { openUrl } from "../platform";
import { useNow } from "../state/hooks";
import { refreshSubscription } from "../state/subscriptions";
import { MeterSegment, Button, Icon, HoverScope, PlatformIcon, Freshness, SectionHeader } from "../components/ui";
import {
  quotaDisplay,
  resetDisplay,
  quotaLabel,
  quotaPercent,
  quotaValue,
} from "./displayPreferences";
import { windowLabel, subscriptionLabel } from "./labels";
import {
  quotaColor,
  compactAge,
  compactReset,
  preciseTime,
  errorLabels,
} from "./presentation";
import { quotaPace } from "./pace";
import { usageLink } from "./usageLinks";
import type { ProviderSnapshot } from "./types";
import UsageHistory from "./UsageHistory";
import ResetCreditDetails from "./ResetCreditDetails";

export default function QuotaBubble({
  provider,
  onRefresh,
  link = true,
}: {
  provider: ProviderSnapshot;
  onRefresh?: () => Promise<void>;
  link?: boolean;
}) {
  const protect = useSensitiveText();
  const now = useNow();
  quotaDisplay.use();
  resetDisplay.use();
  const [requesting, setRequesting] = useState(false),
    [error, setError] = useState("");
  const usageUrl = link ? usageLink(provider) : undefined,
    notices: string[] = [];
  if (error) notices.push(error);
  if (provider.error)
    notices.push(
      provider.error.message ||
        t(errorLabels[provider.error.code] || "usageUnavailable"),
    );
  if (provider.rawUsage?.sharedUsageError) notices.push(t("usageSharedUnavailable"));
  if (provider.accountBlocked) notices.push(t("usageAccountBlocked"));
  if (provider.state === "stale") notices.push(t("usageStale"));
  for (const w of provider.windows)
    if (w.exhausted || provider.blockedPoolIds.includes(w.poolId))
      notices.push(`${windowLabel(w.label)}: ${t("usagePoolBlocked")}`);
  const ageText = compactAge(provider.observedAt, now);
  async function refresh() {
    setRequesting(true);
    setError("");
    try {
      await (onRefresh ? onRefresh() : refreshSubscription(provider.providerId));
    } catch (e) {
      setError(String(e));
    } finally {
      setRequesting(false);
    }
  }
  const readings = provider.windows.map((w) => ({
    w,
    pace: quotaPace(w, provider, now),
  }));
  const hasError =
    !!error ||
    !!provider.accountBlocked ||
    (!!provider.error &&
      ![
        "no-subscription",
        "no-limits-reported",
        "unsupported-platform",
      ].includes(provider.error.code));
  const productRows = provider.productUsage?.rows ?? [];
  const productRemainder = provider.productUsage?.basis === "allowance"
    ? Math.max(0, 100 - productRows.reduce((sum, row) => sum + row.percent, 0)) : 0;
  function detail(key: string) {
    if (key.startsWith("product:")) {
      const row = productRows[Number(key.slice(8))];
      return row ? `${row.label} · ${new Intl.NumberFormat(locale.get(), {maximumFractionDigits: 1}).format(row.percent)}%` : null;
    }
    if (key === "productRemaining") return `${t("usageRemaining")} · ${new Intl.NumberFormat(locale.get(), {maximumFractionDigits: 1}).format(productRemainder)}%`;

    const reading = readings.find((r) => "reading:" + r.w.id === key);
    if (key === "notices")
      return (
        <>
          {notices.map((notice, i) => (
            <div key={i}>{protect(notice)}</div>
          ))}
        </>
      );
    if (reading)
      return (
        <>
          {[reading.pace?.tooltip]
            .filter(Boolean)
            .map((line, i) => (
              <div key={i}>{line}</div>
            ))}
        </>
      );
    if (key === "resets") return <ResetCreditDetails credits={provider.resetCredits} now={now} />;
    return null;
  }
  return (
    <div className="quota-bubble flex min-w-0 flex-col gap-3.5 text-foreground [&_[aria-expanded=true]]:bg-accent">
      <UsageHistory
        detail={detail}
      >
        {({ register, hover, focus, expanded, displayed, highlighted }) => (
          <>
            <SectionHeader level={3} leading={<PlatformIcon role="provider" platform={provider.agentId} size={16} monochrome />} title={<span className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
                {usageUrl ? (
                  <a
                    className="font-semibold text-inherit no-underline hover:underline"
                    href={usageUrl}
                    draggable={false}
                    onClick={(e) => {
                      e.preventDefault();
                      void openUrl(usageUrl).catch((e) => setError(String(e)));
                    }}
                  >
                    {subscriptionLabel(provider)}
                  </a>
                ) : (
                  <strong>{subscriptionLabel(provider)}</strong>
                )}
                {provider.plan && provider.agentId !== "codex" && (
                  <span className="max-w-20 truncate text-xs text-muted-foreground">{provider.plan}</span>
                )}
                {notices.length > 0 && (
                  <span
                    ref={(node) => register("notices", node)}
                    onPointerEnter={(event) => event.pointerType !== "touch" && hover("notices")}
                    onPointerLeave={(event) => event.pointerType !== "touch" && hover("")}
                    onFocus={() => focus("notices")}
                    onBlur={() => focus("")}
                    tabIndex={0}
                    aria-expanded={expanded && displayed === "notices"}
                    className={`inline-flex shrink-0 ${hasError ? "text-destructive" : "text-warning"}`}
                    role="img"
                    aria-label={protect(notices.join(" · "))}
                  >
                    <Icon icon={hasError ? CircleAlert : TriangleAlert} />
                  </span>
                )}
              </span>} actions={<Freshness className="text-xs text-muted-foreground [&>.icon-button]:size-5 [&>.icon-button]:min-h-5 [&>.icon-button]:min-w-5 [&>.icon-button]:p-0.5" observedAt={provider.observedAt} age={ageText}
                timestampLabel={preciseTime(provider.observedAt)} stale={provider.state === "stale"}
                onRefresh={() => void refresh()} refreshLabel={t("usageRefresh")} busy={requesting || provider.refreshing} disabled={!provider.eligible} />} />
            {readings.map(({ w, pace }) => {
              const key = "reading:" + w.id;
              return (
                <div key={w.id} className="flex flex-col gap-2 rounded-sm text-xs tabular-nums">
                  <div className="flex min-h-4 flex-wrap items-center gap-1.5 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate [&>span:first-child]:font-medium">
                    <span>
                      {provider.providerId === "antigravity" && w.scope
                        ? `${w.scope} · `
                        : ""}
                      {windowLabel(w.label)}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-muted-foreground tabular-nums" title={w.resetsAt && Number.isFinite(Date.parse(w.resetsAt)) ? t("quotaResetAt", { time: preciseTime(w.resetsAt) }) : t("quotaResetUnknown")} aria-label={t("quotaResetIn", { time: compactReset(w.resetsAt, now) })}>
                      {compactReset(w.resetsAt, now)}
                    </span>
                  </div>
                  <div
                    title={pace?.tick != null ? t("quotaTimeTick") : undefined}
                    className="relative h-1.5 rounded-full bg-border"
                    role="meter"
                    aria-label={`${windowLabel(w.label)} · ${quotaLabel()}`}
                    aria-valuenow={quotaValue(w)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${quotaValue(w)}%`,
                        background:
                          pace?.color ?? quotaColor(w, provider, now),
                      }}
                    />
                    {pace?.tick != null && (
                      <span
                        className="pointer-events-none absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-xs bg-muted-foreground"
                        style={{
                          left: `clamp(1px, ${pace.tick}%, calc(100% - 1px))`,
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap justify-between gap-1 [&>span:first-child]:whitespace-nowrap">
                    <span>
                      {quotaLabel()} {quotaPercent(w)}
                    </span>
                    <div className="flex min-w-0 items-baseline justify-end gap-x-2.5 gap-y-1 text-right text-muted-foreground">
                      {pace?.label && (
                        <Button
                          variant="ghost"
                          className="h-auto min-h-0 gap-1 p-0 text-right text-xs text-muted-foreground"
                          ref={(node) => register(key, node)}
                          onPointerEnter={(event) => event.pointerType !== "touch" && hover(key)}
                          onPointerLeave={(event) => event.pointerType !== "touch" && hover("")}
                          onClick={() => focus(key)}
                          onFocus={() => focus(key)}
                          onBlur={() => focus("")}
                          aria-expanded={expanded && displayed === key}
                          aria-label={`${windowLabel(w.label)} · ${pace.label}`}
                        >
                          {pace.flame && <Icon icon={Flame} />} {pace.label}
                        </Button>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
            <HoverScope className="flex flex-col text-xs leading-normal" activeKey={highlighted}>
              {(provider.creditBalance ?? 0) > 0 && (
                <div className="flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-2.5 tabular-nums">
                  <span>{t("usageCreditBalance")}</span>
                  <span>{new Intl.NumberFormat(locale.get()).format(Math.ceil(provider.creditBalance!))} credits</span>
                </div>
              )}
              {provider.availableResetCount != null && (
                <div className="flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-2.5 tabular-nums">
                  <span>{t("usageResetCount")}</span>
                  <Button
                    ref={(node) => {
                      register("resets", node);
                    }}
                    variant="ghost"
                    className="-mx-1.5 h-auto min-h-0 shrink-0 rounded-md px-1.5 py-1 text-xs text-inherit"
                    data-hover-target="resets"
                    onPointerEnter={(event) => event.pointerType !== "touch" && hover("resets")}
                    onPointerLeave={(event) => event.pointerType !== "touch" && hover("")}
                    onClick={() => focus("resets")}
                    onFocus={() => focus("resets")}
                    onBlur={() => focus("")}
                    aria-expanded={expanded && displayed === "resets"}
                  >
                    <span>
                      {t("usageResetCountValue", {
                        count: provider.availableResetCount,
                      })}
                    </span>
                  </Button>
                </div>
              )}
              {!!provider.productUsage?.rows.length && (
                <section className="my-3" aria-label={t(provider.productUsage.shared ? "usageSharedProducts" : "usageWeeklyProducts")}>
                  <div className="font-semibold">{t(provider.productUsage.shared ? "usageSharedProducts" : "usageWeeklyProducts")}</div>
                  <div className="mt-2.5 flex gap-1">
                    {productRows.map((row, index) => {
                      const key = `product:${index}`;
                      return <MeterSegment
                        weight={row.percent}
                        key={row.label}
                        variant="ghost"
                        className="h-3 min-h-3 w-auto min-w-3 shrink basis-0 rounded-full border-0 p-0 shadow-none data-[chart=1]:bg-chart-1 data-[chart=2]:bg-chart-2 data-[chart=3]:bg-chart-3 data-[chart=4]:bg-chart-4 data-[chart=5]:bg-chart-5 data-[chart=6]:bg-chart-6 data-[chart=7]:bg-chart-7 data-[chart=8]:bg-chart-8"
                        data-chart={index % 8 + 1}
                        aria-label={`${row.label} · ${row.percent}%`}
                        ref={node => register(key, node)}
                        onPointerEnter={event => event.pointerType !== "touch" && hover(key)}
                        onPointerLeave={event => event.pointerType !== "touch" && hover("")}
                        onFocus={() => focus(key)} onBlur={() => focus("")}
                        onClick={() => focus(key)}
                        aria-expanded={expanded && displayed === key}
                      />;
                    })}
                    {productRemainder > 0 && <MeterSegment weight={productRemainder}
                      variant="ghost" className="h-3 min-h-3 w-auto min-w-3 shrink basis-0 rounded-full border-0 bg-border p-0 shadow-none"
                      aria-label={`${t("usageRemaining")} · ${productRemainder}%`}
                      ref={node => register("productRemaining", node)}
                      onPointerEnter={event => event.pointerType !== "touch" && hover("productRemaining")}
                      onPointerLeave={event => event.pointerType !== "touch" && hover("")}
                      onFocus={() => focus("productRemaining")} onBlur={() => focus("")}
                      onClick={() => focus("productRemaining")}
                      aria-expanded={expanded && displayed === "productRemaining"}
                    />}
                  </div>
                </section>
              )}
            </HoverScope>
          </>
        )}
      </UsageHistory>
    </div>
  );
}
