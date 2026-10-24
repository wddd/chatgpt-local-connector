import type { AgentTimelineEntry } from "../types";
import { t } from "../i18n";
import { changedFiles } from "../state/taskProjection";
import FilePath from "./FilePath";

export function ChangedFiles({ entries, project }: { entries: AgentTimelineEntry[]; project?: string | null }) {
  const files = changedFiles(entries);
  if (!files.length) return null;
  return <section className="task-changes" aria-label={t("timeline.changes")}>
    <strong>{t("detail.filesChanged", { count: files.length })}</strong>
    {files.map(file => <div key={file.path}><FilePath path={file.path} project={project} />
      {file.added !== undefined && <span className="task-added">+{file.added}</span>}
      {file.removed !== undefined && <span className="task-removed">−{file.removed}</span>}
    </div>)}
  </section>;
}
