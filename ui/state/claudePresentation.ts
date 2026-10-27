import type { AgentActivitySession, AgentTimelineEntry } from '../types.ts';

/** Local command output is transcript bookkeeping, not a user request. */
export function claudeRequestText(text: string): string {
  if (!/^\s*<(?:local-command-|command-(?:name|message|args)\b)/i.test(text)) return text;
  return text.replace(/<(local-command-[\w-]+|command-(?:name|message|args))\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '').trim();
}

export function presentActivity<T extends AgentActivitySession>(agent: string, session: T): T {
  if (agent !== 'claude') return session;
  return { ...session, title: session.title && claudeRequestText(session.title),
    headline: claudeRequestText(session.headline), fallbackHeadline: session.fallbackHeadline && claudeRequestText(session.fallbackHeadline),
    recentContent: session.recentContent?.map(claudeRequestText).filter(Boolean) };
}

export function presentTimelineEntries(agent: string, entries: AgentTimelineEntry[]): AgentTimelineEntry[] {
  if (agent !== 'claude') return entries;
  return entries.flatMap(entry => {
    if (entry.type !== 'user' || !entry.text) return [entry];
    const text = claudeRequestText(entry.text);
    return text ? [text === entry.text ? entry : { ...entry, text }] : [];
  });
}
