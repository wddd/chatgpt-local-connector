import { t } from "../i18n";
import { preciseTime, resetText } from "./presentation";
import type { ProviderSnapshot } from "./types";


export default function ResetCreditDetails({ credits, now }: { credits: ProviderSnapshot["resetCredits"]; now: number }) {
  return credits?.length ? <>{credits.map((credit, index) => <div key={index} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-xs tabular-nums [&>span:last-child]:text-right">
    <span><span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{credit.count ?? index + 1}</span>{preciseTime(credit.expiresAt) || t("usageExpiryUnknown")}</span>
    <span>{resetText(credit.expiresAt, now)}</span>
  </div>)}</> : <>{t("usageExpiryUnknown")}</>;
}
