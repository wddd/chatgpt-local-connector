import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../api";
import { locale, t } from "../i18n";
import type { AgentActivitySession, AgentConversation, AgentConversationPage } from "../types";
import { agentActivity } from "../state/activity";
import { selectAgentPanel } from "../state/overviewPanels";
import type { TrackedActivity } from "../state/activityModel";
import { useInterval } from "../state/hooks";
import { ActivityBubbleContent } from "./ActivityBubbles";
import { Button, Loading, Notice } from "./ui";

const ConversationRow = memo(function ConversationRow({ agent, session, live, now, index }: {
  agent: string; session: TrackedActivity; live: boolean; now: number; index: number;
}) {
  return <button type="button" className={`activity-bubble agent-conversation-row ${session.interaction ? "needs-attention" : ""}`}
    data-density="standard" data-external={session.source === "transcript" || undefined} data-timeline-anchor
    style={{ "--row-delay": `${Math.min(index, 5) * 24}ms` } as CSSProperties}
    data-activity-session={JSON.stringify([agent, session.id])}
    aria-label={`${session.title || t("timeline.title")} · ${t("timeline.open")}`}
    onClick={() => selectAgentPanel({ type: "task", agent, session })}>
    <ActivityBubbleContent session={session} now={now} density="standard" historical={!live} />
  </button>;
});

export default function AgentConversations({ agent, active }: { agent: string; active: boolean }) {
  const language = locale.use();
  const { snapshot } = agentActivity.use();
  const [observed, setObserved] = useState<Record<string, AgentActivitySession>>({});
  const [now, setNow] = useState(Date.now);
  const [rows, setRows] = useState<AgentConversation[]>([]), [next, setNext] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>(), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const loaded = useRef<string | undefined>(undefined), marker = useRef<HTMLDivElement>(null);
  const pending = useRef<{ key: string; request: Promise<AgentConversationPage> } | undefined>(undefined);
  const live = new Map(snapshot?.agents[agent]?.sessions.map(session => [session.id, session]) ?? []);
  useInterval(() => setNow(Date.now()), active && live.size ? 1000 : 60000);
  useEffect(() => {
    const sessions = snapshot?.agents[agent]?.sessions;
    if (sessions?.length) setObserved(old => ({ ...old, ...Object.fromEntries(sessions.map(session => [session.id, session])) }));
  }, [agent, snapshot]);
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
  const sessions = new Map<string, TrackedActivity>(rows.map(conversation => [conversation.id, {
    id: conversation.id, source: conversation.source, status: conversation.status, title: conversation.title || undefined, phase: "idle", phaseSince: null,
    headline: "", startedAt: conversation.createdAt, project: conversation.project, projectName: conversation.projectName,
    nativeSessionId: conversation.nativeSessionId ?? undefined, open: conversation.open,
    timeline: true, orderAt: Date.parse(conversation.createdAt ?? "") || 0, conversation: true,
  }]));
  for (const remembered of [...Object.values(observed), ...live.values()]) {
    const current = live.get(remembered.id), history = sessions.get(remembered.id);
    const session = current ?? { ...remembered, phase: "idle" as const, phaseSince: null, interaction: undefined, turnStartedAt: undefined };
    sessions.set(session.id, { ...history, ...session,
      startedAt: history?.startedAt ?? session.startedAt,
      title: session.title || history?.title,
      status: current ? undefined : history?.status,
      orderAt: history?.orderAt || Date.parse(session.startedAt ?? "") || 0,
      conversation: session.source !== "transcript",
    });
  }
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const yesterday = new Date(midnight); yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(midnight); week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  type Group = { id: string; label: string; entries: TrackedActivity[] };
  const groups = Object.fromEntries(["attention", "running", "today", "yesterday", "earlier"].map(id => [id, { id, label: t(`agentPanel.${id}`), entries: [] as TrackedActivity[] }])) as Record<string, Group>;
  const dates = new Map<number, Group>();
  for (const session of [...sessions.values()].sort((a, b) => b.orderAt - a.orderAt || b.id.localeCompare(a.id))) {
    let group = live.has(session.id) ? groups[session.interaction ? "attention" : "running"]
      : session.orderAt >= midnight.getTime() ? groups.today
      : session.orderAt >= yesterday.getTime() ? groups.yesterday : groups.earlier;
    if (!live.has(session.id) && group === groups.earlier && session.orderAt >= week.getTime()) {
      const date = new Date(session.orderAt); date.setHours(0, 0, 0, 0);
      const key = date.getTime();
      group = dates.get(key) ?? { id: `date:${key}`, label: date.toLocaleDateString(language, { month: "short", day: "numeric", weekday: "short" }), entries: [] };
      dates.set(key, group);
    }
    group.entries.push(session);
  }
  const sections = [groups.attention, groups.running, groups.today, groups.yesterday, ...dates.values(), groups.earlier];
  return <div className="activity-task-list agent-conversations">
    {sections.map(({ id, label, entries }) => entries.length > 0 && <section className="agent-task-section" key={id} aria-label={label}>
      <h3 className="agent-task-section-heading" data-attention={id === "attention" || undefined}>
        {label}<span className="agent-section-count">{entries.length}</span>
      </h3>
      <div className="agent-task-section-rows">{entries.map((session, index) => <ConversationRow key={session.id} agent={agent}
        session={session} live={live.has(session.id)} now={now} index={index} />)}</div>
    </section>)}
    {loading && <Loading label={t("timeline.loading")} />}
    {error && <Notice action={<Button onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button>}>{error}</Notice>}
    {!loading && !error && !sessions.size && <p className="timeline-meta">{t("agentPanel.noConversations")}</p>}
    {next && <div ref={marker} className="agent-conversation-more" aria-hidden="true" />}
  </div>;
}
