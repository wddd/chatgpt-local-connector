import { scenarioName } from "../scenarioMode";
import { agentPanel, selectAgentPanel, ingressPanel, selectIngressPanel } from "../state/overviewPanels";
import { PhaseTile, PhaseLabel } from "./activity";
import { resetActivityCore, useActivityTracking } from "../state/activity";
import { orderActivity, visibleActivity } from "../state/activityModel";
import { taskOrder, reorderTasks } from "../state/taskOrder";
import { useInterval } from "../state/hooks";
import { maxVisibleAgents } from "../subscriptions/displayPreferences";
import { subscriptions } from "../state/subscriptions";
import { navigation } from "../state/navigation";
import { AgentQuotaIcon } from "../subscriptions/QuotaRing";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import { Power, LoaderCircle } from "lucide-react";
import { t } from "../i18n";
import { api } from "../api";
import { ingressState, connector, run, refreshConnector, orderedSources, reorderSources } from "../state/connector";
import {
  agents as agentStore,
  orderedAgents,
  moveAgent,
  reorderAgents,
  name,
  type Agent,
} from "../state/agents";
import type { Ingress } from "../state/types";
import SourceIcon from "./SourceIcon";
import { controlSource } from "../controlSources";
import GraphNode from "./GraphNode";
import { ActivityBubble } from "./ActivityBubbles";
import Topology, { type TopologyHandle, type NodeView } from "../topology/Topology";
import TuningPanel from "../topology/TuningPanel";
import { topologyTuningEnabled } from "../state/topology";
import type { SurfaceRect } from "../motion/surface";
import type { WireState } from "../topology/render";
import Onboarding from "./Onboarding";
import { onboarding, openOnboarding } from "../state/onboarding";
import IngressPanel from "./IngressPanel";
import AgentsSettings from "./AgentsSettings";
import { Button, Icon, Notice } from "./ui";
import AgentPanel from "./AgentPanel";
import Hub from "../topology/Hub";
function wireState(state: string): WireState {
  if (["connected", "agentAvailable"].includes(state)) return "normal";
  if (["connectingLabel", "preparing"].includes(state)) return "connecting";
  if (["connectionError", "unknown"].includes(state)) return "error";
  return "inactive";
}
export default function ConnectionOverview({ visible = true }: { visible?: boolean }) {
  const tuning = topologyTuningEnabled.use();
  const tracked = useActivityTracking(), manualOrder = taskOrder.use(), selection = agentPanel.use(), sourceSelection = ingressPanel.use();
  const flow = onboarding.use();
  const detailOpen = !!selection || !!sourceSelection, panelOpen = detailOpen || !!flow;
  const [panelExpanded, setPanelExpanded] = useState(false);
  useEffect(() => { if (!detailOpen) setPanelExpanded(false); }, [detailOpen]);
  const { status, busy, loading, error } = connector.use();
  const inventory = agentStore.use();
  const max = maxVisibleAgents.use();
  const { snapshot } = subscriptions.use(), nav = navigation.use();
  const [agentsOpen, setAgentsOpen] = useState(false), [settingsAgent, setSettingsAgent] = useState<Agent>();
  const initialSetupShown = useRef(false);
  useEffect(() => {
    if (scenarioName || !visible || initialSetupShown.current || !status || loading || error) return;
    initialSetupShown.current = true;
    if (!status.ingresses.some(i => i.sources?.some(s => s.state !== "revoked" && !i.oauth?.pending.some(p => p.id === s.credential.grantId)))) openOnboarding("welcome");
  }, [visible, status, loading, error]);
  const sources = orderedSources();
  const agents = orderedAgents()
    .filter((a) => a.installed)
    .filter((a, index) => index < ([4, 6, 8, 10].includes(max) ? max : 4) || a.agent === selection?.agent);
  const running = sources.some((i) => i.running),
    progressing =
      !!busy || sources.some((i) => ["starting", "stopping"].includes(i.state));
  function edit(ingress?: Ingress, field?: string) {
    if (ingress) { selectIngressPanel(ingress, { editing: true, field }); return; }
    openOnboarding("sources");
  }
  useEffect(() => {
    if (!nav.ingressEdit) return;
    const ingress = status?.ingresses.find((i) => i.id === nav.ingressEdit?.id);
    if (!ingress) return;
    edit(ingress, nav.ingressEdit.field);
    navigation.set((old) => ({ ...old, ingressEdit: undefined }));
  }, [nav.ingressEdit, status?.ingresses]);
  async function toggle() {
    if (busy) return;
    if (
      !running &&
      (!sources.length || sources.every((i) => !i.config.configured))
    ) {
      edit(sources[0]);
      return;
    }
    await run("ingress-all", async () => {
      const result = await api<{
        results: {
          id: string;
          ok: boolean;
          error?: string;
        }[];
      }>(`ingress/${running ? "stop-all" : "start-all"}`, "POST");
      await refreshConnector();
      const errors = result.results.filter((r) => !r.ok);
      if (errors.length)
        throw new Error(
          errors
            .map(
              (r) =>
                `${sources.find((i) => i.id === r.id)?.name || r.id}: ${r.error}`,
            )
            .join("\n"),
        );
    });
  }
  useEffect(() => {
    if (nav.providerId === undefined) return;
    if (nav.providerId === "") {
      setAgentsOpen(true);
      navigation.set((old) => ({ ...old, providerId: undefined }));
      return;
    }
    const provider = snapshot?.providers.find(
      (p) => p.providerId === nav.providerId,
    );
    const agent = orderedAgents().find((a) => a.agent === nav.providerId || a.agent === provider?.agentId)
      ?? (provider ? { agent: provider.agentId, displayName: provider.name } : undefined);
    if (!agent) return;
    selectAgentPanel({ type: "agent", agent: agent.agent });
    navigation.set((old) => ({ ...old, providerId: undefined }));
  }, [nav.providerId, snapshot, inventory.items]);
  function agentState(a: Agent) {
    {
      if (a.adapter?.state === "preparing") return "preparing";
      if (a.adapter?.state === "failed") return "connectionError";
      if (!a.installed || !a.enabled) return "disabled";
    }
    if (a.agent === "codex") {
      const state =
        status?.autoOpenCodex === false
          ? status?.core.appServer.state
          : status?.core.desktop?.state;
      if (state === "ready") return "connected";
      if (state === "error") return "connectionError";
      if (state === "connecting") return "preparing";
      return "disconnected";
    }
    return a.status === "ready"
      ? "connected"
      : a.installed && a.available
        ? "agentAvailable"
        : "connectionError";
  }
  function sourceState(i: Ingress) {
    if (!i.enabled) return "disabled";
    return error ? "unknown" : ingressState(i);
  }
  const core = useRef<HTMLElement>(null), topology = useRef<TopologyHandle>(null);
  const [now, setNow] = useState(Date.now);
  useInterval(() => setNow(Date.now()), visible && Object.values(tracked).some(s => s.length) ? 1000 : null);
  useEffect(() => { if (status?.core.backendSession) resetActivityCore(status.core.backendSession); }, [status?.core.backendSession]);
  const selectedAgent = selection && (orderedAgents().find(a => a.agent === selection.agent) ?? { agent: selection.agent });
  const panelFrame = useCallback((rect: SurfaceRect | null) => topology.current?.panelFrame(rect), []);
  const [switchOn, setSwitchOn] = useState<boolean>();
  useEffect(() => { if (!progressing && status) setSwitchOn(running); }, [running, progressing, status]);
  function moveSource(id: string, by: number) {
    const ids = sources.map(source => source.id);
    const index = ids.indexOf(id), target = index + by;
    if (index < 0 || target < 0 || target >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(target, 0, id);
    reorderSources(ids);
  }
  function moveVisibleAgent(id: string, by: number) {
    const enabled = agents.filter(agent => agent.enabled);
    const index = enabled.findIndex(agent => agent.agent === id);
    const target = enabled[index + by];
    if (index >= 0 && target) moveAgent(id, target.agent);
  }
  const sourceViews: NodeView[] = sources.flatMap(source => {
    return (source.sources ?? []).filter(s => s.state !== "revoked" && !source.oauth?.pending.some(p => p.id === s.credential.grantId)).map(s => ({
      id: s.id, name: s.label, platform: s.product, sourceId: s.id,
    })).map(view => ({
      id: view.id, state: wireState(sourceState(source)), attention: false,
      selected: sourceSelection?.ingress.id === source.id && sourceSelection?.client?.id === view.sourceId, tasks: [], reorderable: !panelOpen && source.sources?.length === 1,
      content: <GraphNode label={`${view.name}: ${t(sourceState(source))}`} state={wireState(sourceState(source))}
        highlighted={sourceSelection?.ingress.id === source.id && sourceSelection?.client?.id === view.sourceId}
        onMove={panelOpen || source.sources?.length !== 1 ? undefined : by => moveSource(source.id, by)}
        onOpen={() => selectIngressPanel(source, { toggle: true, client: { id: view.sourceId, name: view.name, source: view.platform } })}>
        <SourceIcon platform={view.platform} panelVisual /><span className="graph-node-name">{view.name}</span>
      </GraphNode>,
    }));
  });
  if (flow?.step === "connect" && flow.source && !sources.some(s => s.oauth?.grants.some(g => g.id === flow.requestId))) {
    sourceViews.push({ id: flow.requestId && flow.ingressId ? `${flow.ingressId}:${flow.requestId}` : `pending:${flow.source}`, state: "connecting", attention: false, selected: true, tasks: [], reorderable: false,
      content: <GraphNode label={t("connect.waitClient", { name: flow.source })} state="connecting" highlighted onOpen={() => {}}><SourceIcon platform={flow.source} panelVisual /><span className="graph-node-name">{controlSource(flow.source)?.shortName ?? t("connect.other")}</span></GraphNode> });
  }
  const agentViews: NodeView[] = agents.map(agent => {
    const sessions = orderActivity(tracked[agent.agent] ?? [], manualOrder[agent.agent] ?? []), selected = selection?.agent === agent.agent;
    const shown = visibleActivity(sessions, selected ? selection.session?.id : undefined);
    return {
      id: agent.agent, state: wireState(agentState(agent)), attention: sessions.some(s => !!s.interaction), selected, reorderable: agent.enabled && !panelOpen,
      content: <GraphNode label={`${name(agent)}: ${t(agentState(agent))}`} state={wireState(agentState(agent))}
        onMove={agent.enabled && !panelOpen ? by => moveVisibleAgent(agent.agent, by) : undefined}
        highlighted={selected} onOpen={() => selectAgentPanel({ type: "toggle", agent: agent.agent })}>
        <AgentQuotaIcon agent={agent.agent} />
        {selection && !selected && sessions.some(s => s.endedAt === undefined) && <span className="agent-task-count" data-attention={sessions.some(s => !!s.interaction) || undefined}>{sessions.filter(s => s.endedAt === undefined).length}</span>}
        <span className="graph-node-name">{name(agent)}</span>
      </GraphNode>,
      tasks: [
        ...shown.sessions.map(session => ({ id: JSON.stringify([agent.agent, session.id]), taskId: session.id, threadId: session.nativeSessionId, origin: session.origin,
          state: (session.endedAt !== undefined ? "completed" : session.interaction ? "attention" : session.source === "transcript" ? "external" : "running") as import("../topology/render").TaskState,
          selected: selected && selection.session?.id === session.id, reorderable: !panelOpen,
          content: <ActivityBubble agent={agent.agent} session={session} now={now} onMove={panelOpen ? undefined : by => {
            const group = shown.sessions.filter(s => !!s.interaction === !!session.interaction);
            const from = group.findIndex(s => s.id === session.id), to = from + by;
            if (to < 0 || to >= group.length) return;
            const ids = group.map(s => s.id); ids.splice(from, 1); ids.splice(to, 0, session.id);
            reorderTasks(agent.agent, ids, sessions);
          }} />,
        })),
        ...(shown.hidden ? [{ id: JSON.stringify([agent.agent, null]), state: "summary" as const, selected: false,
          content: <button type="button" className="activity-bubble activity-summary" onClick={() => selectAgentPanel({ type: "agent", agent: agent.agent })}>
            <PhaseTile phase="tool" animated={false} /><span className="activity-copy"><span className="activity-phase"><PhaseLabel phase="tool">{t("activity.more", { count: shown.hidden })}</PhaseLabel></span><span className="activity-headline">{t("activity.viewAll")}</span></span>
          </button>,
        }] : []),
      ],
    };
  });
  return (
    <>
      <section ref={core} className={`connection-core brand-mode ${panelOpen ? "side-panel-open" : ""}`} aria-label={t("connectionStatus")}>
        <div className="core-toggle">
          <button
            className={`connection-action ${switchOn ? "is-on" : ""} ${progressing ? "is-busy" : ""}`}
            disabled={progressing || loading || !status || !!error}
            aria-busy={progressing}
            aria-label={t(
              progressing ? "pleaseWait" : running ? "disconnect" : "connect",
            )}
            onClick={() => void toggle()}
          >
            <span className="connection-switch-track" aria-hidden="true">
              <span className="connection-knob">
                <Icon icon={progressing ? LoaderCircle : Power} />
              </span>
            </span>
          </button>
        </div>
        <Topology ref={topology} boundary={core} left={sourceViews} right={agentViews} panelExpanded={panelExpanded}
          onReorderNodes={(side, ids) => side === -1 ? reorderSources([...new Set(ids.filter(id => !id.startsWith("pending:")).map(id => id.split(":")[0]))]) : reorderAgents(ids)}
          onReorderTasks={(_side, agent, ids) => reorderTasks(agent, ids.map(id => JSON.parse(id)[1] as string), tracked[agent] ?? [])}
          brand={<Hub sourceEmpty={!sourceViews.length} agentEmpty={!agents.length}
            onAddSource={() => openOnboarding(sources.length ? "sources" : "welcome")}
            onManageAgents={() => setAgentsOpen(true)} />} />
        {selectedAgent && visible && <AgentPanel agent={selectedAgent} state={agentState(selectedAgent)}
          expanded={panelExpanded} onToggleWidth={() => setPanelExpanded(value => !value)}
          onSettings={() => { setSettingsAgent(selectedAgent); setAgentsOpen(true); }} onPanelFrame={panelFrame} />}
        {sourceSelection && visible && <IngressPanel expanded={panelExpanded} onToggleWidth={() => setPanelExpanded(value => !value)} onPanelFrame={panelFrame} />}
        <div className="activity-edge-fade" aria-hidden="true" />

        {error && (
          <div className="graph-error">
            <Notice
              action={
                <Button onClick={() => void refreshConnector().catch(() => {})}>
                  {t("retry")}
                </Button>
              }
            >
              {error}
            </Notice>
          </div>
        )}
      </section>
      {visible && tuning && <TuningPanel />}
      {flow && visible && <Onboarding onPanelFrame={panelFrame} onAdvanced={() => {
        onboarding.set(undefined); navigation.set(old => ({ ...old, page: "remote", remoteAdvanced: true }));
      }} />}
      {agentsOpen && <AgentsSettings initialAgent={settingsAgent} onClose={() => { setAgentsOpen(false); setSettingsAgent(undefined); }} />}
    </>
  );
}
