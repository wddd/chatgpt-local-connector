import { memo, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "../api";
import { locale, t } from "../i18n";
import type { AgentActivitySession, AgentConversation, AgentConversationPage } from "../types";
import { agentActivity } from "../state/activity";
import { selectAgentPanel } from "../state/overviewPanels";
import { PhaseTile } from "./activity";
import { Button, Icon, Loading, Notice } from "./ui";

const ConversationRow = memo(function ConversationRow({ agent, conversation, live }: {
  agent: string; conversation: AgentConversation; live?: AgentActivitySession;
}) {
  const language = locale.use();
  const title = conversation.title || t("timeline.title");
  const created = Date.parse(conversation.createdAt ?? "");
  const project = conversation.project?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  return <button type="button" className="activity-task-row agent-conversation-row" data-timeline-anchor
    data-activity-session={JSON.stringify([agent, conversation.id])}
    aria-label={`${title} · ${t("timeline.open")}`} onClick={() => selectAgentPanel({ type: "task", agent, session: {
      id: conversation.id, source: conversation.source, phase: "idle", phaseSince: null, headline: title,
      startedAt: conversation.createdAt, project: conversation.project,
      nativeSessionId: conversation.nativeSessionId ?? undefined, open: conversation.open,
      ...live, title, timeline: true, orderAt: Number.isFinite(created) ? created : 0, conversation: true,
    } })}>
    {live ? <PhaseTile phase={live.interaction ? "interaction" : live.phase} animated={false} />
      : <span className="agent-conversation-symbol"><Icon icon={MessageSquare} /></span>}
    <span className="activity-copy">
      <span className="activity-row-title"><strong>{title}</strong>
        {Number.isFinite(created) && <time dateTime={conversation.createdAt!}>{new Date(created).toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" })}</time>}
      </span>
      {(live?.headline || project) && <span className="agent-conversation-preview">{live?.headline || project}</span>}
    </span>
  </button>;
});

export default function AgentConversations({ agent, active }: { agent: string; active: boolean }) {
  const { snapshot } = agentActivity.use();
  const [rows, setRows] = useState<AgentConversation[]>([]), [next, setNext] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>(), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const loaded = useRef<string | undefined>(undefined), marker = useRef<HTMLDivElement>(null);
  const pending = useRef<{ key: string; request: Promise<AgentConversationPage> } | undefined>(undefined);
  useEffect(() => {
    const key = cursor ?? "";
    if (!active || loaded.current === key) return;
    let stopped = false;
    setLoading(true); setError("");
    const request = pending.current?.key === key ? pending.current.request
      : api<AgentConversationPage>("agents/conversations", "POST", { agent, limit: 20, ...(cursor ? { cursor } : {}) });
    pending.current = { key, request };
    void request
      .then(page => {
        if (stopped) return;
        loaded.current = key;
        setRows(old => [...new Map([...old, ...page.data].map(row => [row.id, row])).values()]
          .sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0) || b.id.localeCompare(a.id)));
        setNext(page.nextCursor);
      }).catch(error => { if (!stopped) setError(String(error)); })
      .finally(() => {
        if (pending.current?.request === request) pending.current = undefined;
        if (!stopped) setLoading(false);
      });
    return () => { stopped = true; };
  }, [agent, active, cursor, retry]);
  useEffect(() => {
    const node = marker.current;
    if (!active || !node || !next || loading || error) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setCursor(next);
    }, { root: node.closest(".agent-view-scroll"), rootMargin: "0px 0px 160px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, next, loading, error]);
  const live = new Map(snapshot?.agents[agent]?.sessions.map(session => [session.id, session]) ?? []);
  return <div className="activity-task-list">
    {rows.map(conversation => <ConversationRow key={conversation.id} agent={agent} conversation={conversation} live={live.get(conversation.id)} />)}
    {loading && <Loading label={t("timeline.loading")} />}
    {error && <Notice action={<Button onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button>}>{error}</Notice>}
    {!loading && !error && !rows.length && <p className="timeline-meta">{t("agentPanel.noConversations")}</p>}
    {next && <div ref={marker} className="agent-conversation-more" aria-hidden="true" />}
  </div>;
}
