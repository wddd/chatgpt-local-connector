import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import type { AgentTimelineEntry } from "../types";
import { t } from "../i18n";
import { changedFiles } from "../state/taskProjection";
import FilePath from "./FilePath";
import { Button, Icon } from "./ui";

export function ChangedFiles({ entries, project }: { entries: AgentTimelineEntry[]; project?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const files = changedFiles(entries);
  if (!files.length) return null;
  const renderFile = (file: typeof files[number]) => <div className="task-change-row flex min-w-0 items-baseline gap-1.5 [&>.file-path]:flex-1" key={file.path}><FilePath path={file.path} project={project} />
      {(file.operation === "create" || file.operation === "delete") && <span className="task-file-operation shrink-0 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success data-[operation=delete]:bg-danger-soft data-[operation=delete]:text-destructive" data-operation={file.operation}>{t(file.operation === "create" ? "detail.fileCreated" : "detail.fileDeleted")}</span>}
      {file.added !== undefined && <span className="task-added text-success">+{file.added}</span>}
      {file.removed !== undefined && <span className="task-removed text-destructive">−{file.removed}</span>}
    </div>;
  return <Collapsible open={expanded} onOpenChange={setExpanded} asChild><section className="task-changes mt-3 grid gap-1.5 border-t pt-2.5 text-xs" aria-label={t("timeline.changes")}>
    {files.length > 3 ? <CollapsibleTrigger asChild><Button variant="ghost" className="task-changes-summary min-h-7 justify-between p-0 text-xs [&[aria-expanded=true]>.timeline-chevron]:rotate-90"><strong>{t("detail.filesChanged", { count: files.length })}</strong><Icon icon={ChevronRight} className="timeline-chevron shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none [[data-reduced-motion=true]_&]:transition-none" /></Button></CollapsibleTrigger>
      : <strong>{t("detail.filesChanged", { count: files.length })}</strong>}
    {files.slice(0, 3).map(renderFile)}
    {files.length > 3 && <CollapsibleContent className="task-changes-more grid gap-1.5">{files.slice(3).map(renderFile)}</CollapsibleContent>}
  </section></Collapsible>;
}
