import { RefreshCw } from 'lucide-react';
import { ContextIcon } from './composites/ContextIcon';
import { SectionHeader, Empty, Loading, Notice } from "./ui";
import { useAppNow } from "../state/appEnvironment";
import { MessagesSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { locale, t } from "../i18n";
import type { AgentActivitySession, AgentConversation, AgentConversationPage, ProviderAccount } from "../types";
import { accountOwns } from "../accountPresentation";
import { agentActivity } from "../state/activity";
import { trackedActivity } from "../state/activityBubbles";
import { selectAgentPanel } from "../state/overviewPanels";
import type { TrackedActivity } from "../state/activityModel";
import { TaskRow } from "./objects/task";
import { conversationActivity } from "./objects/task/projection";

export default function AgentConversations({ agent, account, accountId, active }: { agent: string; account?: ProviderAccount; accountId?: string; active: boolean }) {
  const language = locale.use();
  const { snapshot } = agentActivity.use();
  const tracked = trackedActivity.use(), retained = tracked[agent] ?? [];
  const unread = new Set(retained.filter(session => session.endedAt !== undefined && session.readAt === undefined).map(session => session.id));
  const [observed, setObserved] = useState<Record<string, AgentActivitySession>>({});
  const [rows, setRows] = useState<AgentConversation[]>([]), [next, setNext] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>(), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const loaded = useRef<string | undefined>(undefined), marker = useRef<HTMLDivElement>(null);
  const pending = useRef<{ key: string; request: Promise<AgentConversationPage> } | undefined>(undefined);
  const belongs = (session: Pick<TrackedActivity, "agentAccountId" | "dispatchSummary">) => !accountId || (account
    ? accountOwns(account, session.agentAccountId ?? session.dispatchSummary?.agentAccountId)
    : (session.agentAccountId ?? session.dispatchSummary?.agentAccountId) === accountId);
  const live = new Map(snapshot?.agents[agent]?.sessions.filter(belongs).map(session => [session.id, session]) ?? []);
  const now = useAppNow(active && live.size ? 1000 : 60000);
  useEffect(() => {
    const sessions = [...(tracked[agent] ?? []), ...(snapshot?.agents[agent]?.sessions ?? [])];
    if (sessions.length) setObserved(old => ({ ...old, ...Object.fromEntries(sessions.map(session => [session.id, session])) }));
  }, [agent, snapshot, tracked]);
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
  const sessions = new Map<string, TrackedActivity>(rows.map(conversation => [conversation.id, conversationActivity(conversation)]));
  for (const remembered of [...Object.values(observed), ...retained, ...live.values()]) {
    const current = live.get(remembered.id), history = sessions.get(remembered.id);
    const session = current ?? { ...remembered, phase: "idle" as const, phaseSince: null, interaction: undefined, turnStartedAt: undefined };
    sessions.set(session.id, { ...history, ...session,
      startedAt: history?.startedAt ?? session.startedAt,
      title: session.title || history?.title,
      status: current ? undefined : history?.status,
      dispatchSummary: session.dispatchSummary ?? history?.dispatchSummary,
      agentAccountId: session.agentAccountId ?? history?.agentAccountId,
      turnCount: session.turnCount === undefined ? history?.turnCount : Math.max(session.turnCount, history?.turnCount ?? 0),
      orderAt: history?.orderAt || Date.parse(session.startedAt ?? "") || 0,
      conversation: history?.conversation || session.source !== "transcript",
    });
  }
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const yesterday = new Date(midnight); yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(midnight); week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  type Group = { id: string; label: string; entries: TrackedActivity[] };
  const groups = Object.fromEntries(["attention", "running", "unread", "today", "yesterday", "earlier"].map(id => [id, { id, label: t(`agentPanel.${id}`), entries: [] as TrackedActivity[] }])) as Record<string, Group>;
  const dates = new Map<number, Group>();
  const visibleSessions = [...sessions.values()].filter(belongs).sort((a, b) => b.orderAt - a.orderAt || b.id.localeCompare(a.id));
  for (const session of visibleSessions) {
    let group = live.has(session.id) ? groups[session.interaction ? "attention" : "running"]
      : unread.has(session.id) ? groups.unread
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
  const sections = [groups.attention, groups.running, groups.unread, groups.today, groups.yesterday, ...dates.values(), groups.earlier];
  const empty = !loading && !error && !visibleSessions.length && !next;
  return <div className="activity-task-list agent-conversations flex min-w-0 grow flex-col gap-3 data-[empty]:justify-center" data-empty={empty || undefined}>
    {sections.map(({ id, label, entries }) => entries.length > 0 && <section className="agent-task-section min-w-0" key={id} aria-label={label}>
      <SectionHeader className="agent-task-section-heading sticky top-0 z-2 m-0 bg-background px-3 py-2 text-xs font-semibold text-muted-foreground data-[attention]:text-warning [&_.section-header-count]:rounded-full [&_.section-header-count]:bg-muted [&_.section-header-count]:px-1.5" data-attention={id === "attention" || undefined} level={3} title={label} count={entries.length} />
      <div className="agent-task-section-rows flex flex-col gap-2">{entries.map((session) => <TaskRow kind="activity" key={session.id} agent={agent} onOpen={() => selectAgentPanel({ type: "task", agent, session })}
        session={session} live={live.has(session.id)} now={now} />)}</div>
    </section>)}
    {loading && <Loading label={t("timeline.loading")} />}
    {error && <Notice action={<ContextIcon icon={RefreshCw} label={t("retry")} onClick={() => setRetry(value => value + 1)} />}>{error}</Notice>}
    {empty && <Empty icon={MessagesSquare}>{t("agentPanel.noConversations")}</Empty>}
    {next && <div ref={marker} className="agent-conversation-more h-px" aria-hidden="true" />}
  </div>;
}
