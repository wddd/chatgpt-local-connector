// Message URLs are content, never application navigation relative to the UI origin.
const messageAppSchemes = ["codex", "vscode", "vscode-insiders", "cursor", "zed", "agent-remote-control"];
export type TimelineLink = { kind: "external" | "fragment" | "file" | "image"; target: string };
export function timelineLink(value: string): TimelineLink | undefined {
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return;
  if (href.startsWith("#")) return { kind: "fragment", target: href.slice(1) };
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(href)) return { kind: "image", target: href };
  if (href.startsWith("//")) return { kind: "external", target: `https:${href}` };
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1].toLowerCase();
  if (scheme && ["http", "https", "mailto", "tel", ...messageAppSchemes].includes(scheme)) return { kind: "external", target: href };
  let path = href.split(/[?#]/, 1)[0];
  if (scheme === "file") {
    try {
      const url = new URL(href);
      // Network shares must not be interpreted as local paths on another host.
      if (url.hostname && url.hostname !== "localhost") return;
      path = url.pathname;
      if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    } catch { return; }
  } else if (scheme && !/^[a-z]:[\\/]/i.test(href)) return;
  try { path = decodeURIComponent(path); } catch { return; }
  // File-manager navigation uses the file, without a source line/column suffix.
  path = path.replace(/:\d+(?::\d+)?$/, "");
  return path ? { kind: "file", target: path } : undefined;
}
export function timelineUrl(value: string): string {
  return timelineLink(value) ? value : "";
}
