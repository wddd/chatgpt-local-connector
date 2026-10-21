import { filePathParts } from "../state/activityModel";

export default function FilePath({ path, project }: { path: string; project?: string | null }) {
  const { fullPath, displayPath, directory, filename } = filePathParts(path, project);
  return <span className="file-path" title={fullPath} aria-label={displayPath}>
    {directory && <span className="file-path-directory" aria-hidden="true">{directory}</span>}
    <span className="file-path-name" aria-hidden="true">{filename}</span>
  </span>;
}
