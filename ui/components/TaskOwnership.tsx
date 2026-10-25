import { t } from "../i18n";
import type { TaskOwnership as Ownership } from "../types";

export default function TaskOwnership({ ownership }: { ownership?: Ownership }) {
  if (!ownership) return null;
  const owner = ownership.currentOwner || ownership.owner || "unknown";
  const label = (owner: string) => t(`detail.owner.${owner}`);
  return <details className="task-ownership">
    <summary>{t("detail.owner", { owner: label(owner) })}</summary>
    <ol aria-label={t("detail.handoffHistory")}>
      {ownership.history?.map(row => <li key={row.eventId}>
        <span>{label(row.from)} → {label(row.to)}</span>{" "}
        <time dateTime={row.observedAt}>{new Date(row.observedAt).toLocaleString()}</time>
      </li>)}
    </ol>
  </details>;
}
