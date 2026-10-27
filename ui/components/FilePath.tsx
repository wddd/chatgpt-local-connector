import { filePathParts } from "../state/activityModel";

export default function FilePath({ path, project }: { path: string; project?: string | null }) {
  const { fullPath, displayPath, directory, filename } = filePathParts(path, project);
  return <span className="file-path flex min-w-0 max-w-full whitespace-nowrap" title={fullPath} aria-label={displayPath}>
    {directory && <span className="file-path-directory min-w-0 truncate text-muted-foreground" aria-hidden="true">{directory}</span>}
    <span className="file-path-name shrink-0" aria-hidden="true">{filename}</span>
  </span>;
}
