import { Monitor, UserRound } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { locale, t } from "../i18n";
import { useNow } from "../state/hooks";
import type { TaskOwnership as Ownership } from "../types";
import { Button, Icon } from "./ui";

function ownerLabel(owner: string) {
  return t(`detail.owner.${owner === "connector" || owner === "desktop" || owner === "external" || owner === "unheld" ? owner : "unknown"}`);
}

export default function TaskOwnership({ ownership }: { ownership?: Ownership }) {
  const language = locale.use(), now = useNow();
  if (!ownership) return null;
  const owner = ownership.currentOwner || ownership.owner || "unknown";
  if (owner === "connector") return null;
  const relative = (timestamp: string) => {
    const seconds = (Date.parse(timestamp) - now) / 1000;
    if (!Number.isFinite(seconds)) return t("detail.timeUnknown");
    const unit = Math.abs(seconds) < 60 ? "second" : Math.abs(seconds) < 3600 ? "minute" : Math.abs(seconds) < 86400 ? "hour" : "day";
    return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(Math.round(seconds / { second: 1, minute: 60, hour: 3600, day: 86400 }[unit]), unit);
  };
  return <Popover>
    <PopoverTrigger asChild><Button variant="ghost" className="task-ownership-chip h-auto min-h-7 min-w-0 max-w-full gap-1 rounded-full border-0 bg-muted px-2 py-1 text-xs text-muted-foreground [&>span]:truncate" aria-label={`${t("detail.owner", { owner: ownerLabel(owner) })} · ${t("detail.handoffHistory")}`}>
      <Icon icon={owner === "desktop" ? Monitor : UserRound} /><span>{ownerLabel(owner)}</span>
    </Button></PopoverTrigger>
    <PopoverContent className="task-ownership-history w-70 max-w-full p-3 duration-150 [[data-reduced-motion=true]_&]:animate-none [[data-reduced-motion=true]_&]:transition-none [&_ol]:m-0 [&_ol]:grid [&_ol]:list-none [&_ol]:gap-2.5 [&_ol]:p-0 [&_li]:grid [&_li]:gap-1 [&_li]:wrap-anywhere [&_time]:text-xs [&_time]:text-muted-foreground [&_p]:m-0" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={t("detail.handoffHistory")}>
      {ownership.history?.length ? <ol aria-label={t("detail.handoffHistory")}>{ownership.history.map(row => <li key={row.eventId}>
        <span>{ownerLabel(row.from)} → {ownerLabel(row.to)}</span>
        <time dateTime={row.observedAt} title={Number.isFinite(Date.parse(row.observedAt)) ? new Date(row.observedAt).toLocaleString(language) : undefined}>{relative(row.observedAt)}</time>
      </li>)}</ol> : <p>{t("detail.noHandoffs")}</p>}
    </PopoverContent>
  </Popover>;
}
