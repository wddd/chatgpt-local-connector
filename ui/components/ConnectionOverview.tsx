import { PhaseTile, PhaseLabel } from "./activity";
import { agentPanel, selectAgentPanel, resetActivityHistory, useActivityTracking } from "../state/activity";
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
import GraphNode from "./GraphNode";
import { ActivityBubble } from "./ActivityBubbles";
import Topology, { type TopologyHandle, type NodeView } from "../topology/Topology";
import TuningPanel from "../topology/TuningPanel";
import { topologyTuningEnabled } from "../state/topology";
import type { SurfaceRect } from "../motion/surface";
import type { WireState } from "../topology/render";
import IngressDialog from "./IngressDialog";
import SetupDialog from "./SetupDialog";
import { useSetup, type SetupGoal } from "../state/setup";
import IngressDetailsDialog from "./IngressDetailsDialog";
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
  const tracked = useActivityTracking(), manualOrder = taskOrder.use(), selection = agentPanel.use();
  const { status, busy, loading, error } = connector.use();
  const inventory = agentStore.use();
  const max = maxVisibleAgents.use();
  const { snapshot } = subscriptions.use(), nav = navigation.use();
  const [setupMode, setSetupMode] = useState<"entry" | "progress" | null>(null);
  const [setupGoal, setSetupGoal] = useState<SetupGoal>();
  const [initialSource, setInitialSource] = useState<string>();
  const [manualSetup, setManualSetup] = useState(false);
  const [focusField, setFocusField] = useState<string>();
  const [editing, setEditing] = useState<Ingress>(),
    [formOpen, setFormOpen] = useState(false),
    [details, setDetails] = useState<Ingress>(),
    [autoConnect, setAutoConnect] = useState(false),
    [agentsOpen, setAgentsOpen] = useState(false),
    [settingsAgent, setSettingsAgent] = useState<Agent>();
  const setup = useSetup(visible && !formOpen && !details && !agentsOpen && !selection);
  const initialSetupShown = useRef(false);
  useEffect(() => {
    if (!visible || initialSetupShown.current || !status || loading || error || !setup.snapshot) return;
    initialSetupShown.current = true;
    if (setup.snapshot.hasState && !setup.snapshot.complete) setSetupMode("progress");
    else if (!setup.snapshot.hasState && !status.ingresses.length) setSetupMode("entry");
  }, [visible, status, loading, error, setup.snapshot]);
  const sources = orderedSources();
  const agents = orderedAgents()
    .filter((a) => a.installed)
    .filter((a, index) => index < ([4, 6, 8, 10].includes(max) ? max : 4) || a.agent === selection?.agent);
  const running = sources.some((i) => i.running),
    progressing =
      !!busy || sources.some((i) => ["starting", "stopping"].includes(i.state));
  function edit(ingress?: Ingress, field?: string) {
    setFocusField(field);
    setInitialSource(undefined);
    setManualSetup(false);
    setEditing(ingress);
    setFormOpen(true);
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
  useEffect(() => { if (status?.core.backendSession) resetActivityHistory(status.core.backendSession); }, [status?.core.backendSession]);
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
  const sourceViews: NodeView[] = sources.map(source => ({
    id: source.id, state: wireState(sourceState(source)), attention: false, selected: false, tasks: [], reorderable: !selection,
    content: <GraphNode label={`${source.name}: ${t(sourceState(source))}`} state={wireState(sourceState(source))}
      onMove={selection ? undefined : by => moveSource(source.id, by)} onOpen={() => { setAutoConnect(false); setDetails(source); }}>
      <SourceIcon platform={source.controlSource} panelVisual /><span className="graph-node-name">{source.name}</span>
    </GraphNode>,
  }));
  const agentViews: NodeView[] = agents.map(agent => {
    const sessions = orderActivity(tracked[agent.agent] ?? [], manualOrder[agent.agent] ?? []), selected = selection?.agent === agent.agent;
    const shown = visibleActivity(sessions, selected ? selection.session?.id : undefined);
    return {
      id: agent.agent, state: wireState(agentState(agent)), attention: sessions.some(s => !!s.interaction), selected, reorderable: agent.enabled && !selection,
      content: <GraphNode label={`${name(agent)}: ${t(agentState(agent))}`} state={wireState(agentState(agent))}
        onMove={agent.enabled && !selection ? by => moveVisibleAgent(agent.agent, by) : undefined}
        highlighted={selected} onOpen={() => selectAgentPanel({ type: "toggle", agent: agent.agent })}>
        <AgentQuotaIcon agent={agent.agent} />
        {selection && !selected && sessions.some(s => s.endedAt === undefined) && <span className="agent-task-count" data-attention={sessions.some(s => !!s.interaction) || undefined}>{sessions.filter(s => s.endedAt === undefined).length}</span>}
        <span className="graph-node-name">{name(agent)}</span>
      </GraphNode>,
      tasks: [
        ...shown.sessions.map(session => ({ id: JSON.stringify([agent.agent, session.id]),
          state: (session.endedAt !== undefined ? "completed" : session.interaction ? "attention" : session.source === "transcript" ? "external" : "running") as import("../topology/render").TaskState,
          selected: selected && selection.session?.id === session.id, reorderable: !selection,
          content: <ActivityBubble agent={agent.agent} session={session} now={now} onMove={selection ? undefined : by => {
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
      <section ref={core} className={`connection-core brand-mode ${selection ? "agent-panel-open" : ""}`} aria-label={t("connectionStatus")}>
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
        <Topology ref={topology} boundary={core} left={sourceViews} right={agentViews}
          onReorderNodes={(side, ids) => side === -1 ? reorderSources(ids) : reorderAgents(ids)}
          onReorderTasks={(_side, agent, ids) => reorderTasks(agent, ids.map(id => JSON.parse(id)[1] as string), tracked[agent] ?? [])}
          brand={<Hub sourceEmpty={!sources.length} agentEmpty={!agents.length}
            onAddSource={() => { if (!sources.length) { setSetupGoal(undefined); setSetupMode("entry"); } else edit(); }}
            onManageAgents={() => setAgentsOpen(true)} />} />
        {selectedAgent && visible && <AgentPanel agent={selectedAgent} state={agentState(selectedAgent)} sessions={tracked[selectedAgent.agent] ?? []} now={now}
          onSettings={() => { setSettingsAgent(selectedAgent); setAgentsOpen(true); }} onPanelFrame={panelFrame} />}
        <div className="activity-edge-fade" aria-hidden="true" />
        {setup.snapshot?.goal && !setup.snapshot.complete && <div className="setup-resume"><Button onClick={() => setSetupMode("progress")}>{t("setup.resume")}</Button></div>}
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
      {setupMode && visible && <SetupDialog mode={setupMode} setMode={setSetupMode} fixedGoal={setupGoal} snapshot={setup.snapshot} error={setup.error} refresh={setup.refresh}
        onClose={() => { setSetupMode(null); if (setup.snapshot?.complete) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".hub-source")?.focus()); }} onManual={() => {
          setSetupMode(null);
          edit();
          setManualSetup(true);
          setInitialSource(setupGoal === "claude-loop" ? "claude" : setupGoal === "chatgpt-chat" ? "chatgpt" : undefined);
        }} />}
      {formOpen && (
        <IngressDialog
          key={`${editing?.id ?? "new"}:${focusField ?? ""}`}
          ingress={editing}
          focusField={focusField}
          initialSource={initialSource}
          onGuided={manualSetup ? undefined : source => {
            const goal = source === "claude" ? "claude-loop" : source === "chatgpt" ? "chatgpt-chat" : undefined;
            if (!goal) return false;
            setSetupGoal(goal);
            setFormOpen(false);
            setSetupMode("entry");
            return true;
          }}
          onClose={() => setFormOpen(false)}
          onRemoved={() => { setFormOpen(false); setDetails(undefined); }}
          onSaved={(ingress) => {
            setFormOpen(false);
            if (setupMode) { void setup.refresh(); return; }
            setAutoConnect(true);
            setDetails(ingress);
          }}
        />
      )}
      {details && (
        <IngressDetailsDialog
          ingress={details}
          autoConnect={autoConnect}
          onClose={() => setDetails(undefined)}
          onEdit={(ingress) => {
            edit(ingress);
          }}
        />
      )}
      {agentsOpen && <AgentsSettings initialAgent={settingsAgent} onClose={() => { setAgentsOpen(false); setSettingsAgent(undefined); }} />}
    </>
  );
}
