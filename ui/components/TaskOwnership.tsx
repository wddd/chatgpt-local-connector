import { Monitor, UserRound } from "lucide-react";
import { Popover } from "radix-ui";
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
  return <Popover.Root>
    <Popover.Trigger asChild><Button variant="ghost" className="task-ownership-chip" aria-label={`${t("detail.owner", { owner: ownerLabel(owner) })} · ${t("detail.handoffHistory")}`}>
      <Icon icon={owner === "desktop" ? Monitor : UserRound} /><span>{ownerLabel(owner)}</span>
    </Button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="popover task-ownership-history" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={t("detail.handoffHistory")}>
      {ownership.history?.length ? <ol aria-label={t("detail.handoffHistory")}>{ownership.history.map(row => <li key={row.eventId}>
        <span>{ownerLabel(row.from)} → {ownerLabel(row.to)}</span>
        <time dateTime={row.observedAt} title={Number.isFinite(Date.parse(row.observedAt)) ? new Date(row.observedAt).toLocaleString(language) : undefined}>{relative(row.observedAt)}</time>
      </li>)}</ol> : <p>{t("detail.noHandoffs")}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
