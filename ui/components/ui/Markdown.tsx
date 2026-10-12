import { Fragment, type ReactNode } from "react";

// Render the supported Markdown subset as React nodes; raw HTML stays text.
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> :
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> :
    part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : part);
}
export function plainMarkdown(text: string) {
  const lines = text.split(/\r?\n/);
  const paragraph: string[] = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (/^\s{0,3}#{1,6}(?:\s|$)/.test(line) || /^\s*(=+|-+)\s*$/.test(lines[i + 1] || "")) { if (paragraph.length) break; if (!line.trimStart().startsWith("#")) i++; continue; }
    if (!line.trim()) { if (paragraph.length) break; continue; }
    paragraph.push(line);
  }
  return paragraph.join(" ").replace(/^\s*(```|~~~)[^\n]*$/gm, '').replace(/!?(\[([^\]]+)\])\([^)]*\)/g, '$2')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '').replace(/(`+)(.*?)\1/g, '$2').replace(/(\*\*|__|~~)(.*?)\1/g, '$2').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,!?，。])/g, '$1$2').replace(/\s+/g, ' ').trim();
}
export function Markdown({ children }: { children: string }) {
  const lines = children.split(/\r?\n/), blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!, fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(fence[1]!)) code.push(lines[i++]!);
      i++; blocks.push(<pre key={i}><code>{code.join('\n')}</code></pre>); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const Tag = `h${heading[1]!.length}` as 'h1';
      blocks.push(<Tag key={i}>{inline(heading[2]!)}</Tag>); i++; continue;
    }
    const list = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]!), items: ReactNode[] = [];
      while (i < lines.length) {
        const item = lines[i]!.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!item || /^\d/.test(item[1]!) !== ordered) break;
        items.push(<li key={i}>{inline(item[2]!)}</li>); i++;
      }
      blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>); continue;
    }
    if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
    i++;
  }
  return <div className="markdown">{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>;
}
