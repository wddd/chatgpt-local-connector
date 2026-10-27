import { useRelays, publicRelay } from "../state/relay";
import { SrcAccountNode } from "./objects/src-account";
import { SrcPlatformNode } from "./objects/src-platform";
import { ingressState } from "../sourcePresentation";
import { useAppNow } from "../state/appEnvironment";
import { appEnvironment, envOverrides } from "../state/appEnvironment";
import { controlSource } from '../controlSources';
import { orderedSubset } from '../topology/order';
import { accountViews } from '../topology/accountViews';
import { accountOwns } from '../accountPresentation';
import { topologyMode, topologyAccountOrder } from '../topology/accountState';
import { useAccounts } from '../state/accounts';
import { scenarioName } from "../scenarioMode";
import { agentPanel, selectAgentPanel, ingressPanel, selectSourcePanel } from "../state/overviewPanels";
import { PhaseTile, PhaseLabel } from "./activity";
import { resetActivityCore, useActivityTracking } from "../state/activity";
import { orderActivity, visibleActivity, effectiveBubbleDensity, bubbleWidths, bubbleHeights } from "../state/activityModel";
import { taskOrder, reorderTasks } from "../state/taskOrder";
import { maxVisibleAgents, bubbleDensity, bubbleWidth, bubbleAutoCompact } from "../subscriptions/displayPreferences";
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
import { connector, run, refreshConnector, orderedSources, reorderSources } from "../state/connector";
import {
  agents as agentStore,
  orderedAgents,
  moveAgent,
  reorderAgents,
  name,
  type Agent,
} from "../state/agents";
import type { Ingress } from "../state/types";
import { PlatformIcon, Button, Icon, Notice } from "./ui";
import { isPendingSource } from "../sourcePresentation";
import { AgentPlatformNode } from './objects/agent-platform';
import { agentState as projectAgentState } from './objects/agent-platform/presentation';
import { ActivityBubble } from "./ActivityBubbles";
import Topology, { type TopologyHandle, type NodeView, type PanelLayout } from "../topology/Topology";
import { PANEL_MIN_WIDTH } from "../topology/solve";
import TuningPanel from "../topology/TuningPanel";
import { topologyTuningEnabled } from "../state/topology";
import type { SurfaceRect } from "../motion/surface";
import type { WireState } from "../topology/render";
import Onboarding from "./Onboarding";
import SourceConnectionSetup from "./SourceConnectionSetup";
import { onboarding, openOnboarding, connectionSetup, addedSource } from "../state/onboarding";
import IngressPanel from "./IngressPanel";
import AgentsSettings from "./AgentsSettings";
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
  const { tracked, markRead } = useActivityTracking(), manualOrder = taskOrder.use(), selection = agentPanel.use(), sourceSelection = ingressPanel.use();
  const flow = onboarding.use(), newConnection = connectionSetup.use();
  const newSourceId = addedSource.use();
  useEffect(() => {
    if (!newSourceId || onboarding.get()) return;
    const timer = setTimeout(() => addedSource.set(undefined), 2000);
    return () => clearTimeout(timer);
  }, [newSourceId, flow]);
  const detailOpen = !!selection || !!sourceSelection, panelOpen = detailOpen || !!flow || !!newConnection;
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelKey = selection && !selection.closing ? `agent:${selection.agent}`
    : sourceSelection && !sourceSelection.closing ? `source:${sourceSelection.product}` : undefined;
  appEnvironment.use();
  const [panelLayout, setPanelLayout] = useState<PanelLayout>({ width: PANEL_MIN_WIDTH, expanded: false });
  const updatePanelLayout = useCallback((next: PanelLayout) => {
    // Release scene space immediately, retaining the shell's last geometry
    // until its dismissal animation completes.
    setPanelLayout(old => next.key === undefined ? old.key === undefined ? old : { ...old, key: undefined }
      : JSON.stringify(old) === JSON.stringify(next) ? old : next);
  }, []);
  const panelReady = panelLayout.key === panelKey;
  useEffect(() => { if (!detailOpen) setPanelExpanded(false); }, [detailOpen]);
  const { status, sources: sourceRecords, sourcesLoaded, busy, loading, error } = connector.use();
  const inventory = agentStore.use();
  const { items: accounts } = useAccounts(), mode = topologyMode.use(), accountOrders = topologyAccountOrder.use();
  const max = maxVisibleAgents.use();
  const density = bubbleDensity.use(), width = bubbleWidths[bubbleWidth.use()], autoCompact = bubbleAutoCompact.use();
  const [expandedQueue, setExpandedQueue] = useState<string>();
  useEffect(() => { if (!visible || panelOpen) setExpandedQueue(undefined); }, [visible, panelOpen]);
  useEffect(() => {
    if (!expandedQueue) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest<HTMLElement>("[data-activity-queue]")?.dataset.activityQueue !== expandedQueue) setExpandedQueue(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setExpandedQueue(undefined);
      requestAnimationFrame(() => {
        const trigger = [...(core.current?.querySelectorAll<HTMLButtonElement>(".activity-summary") ?? [])]
          .find(button => button.closest<HTMLElement>("[data-activity-queue]")?.dataset.activityQueue === expandedQueue);
        trigger?.focus();
      });
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", escape); };
  }, [expandedQueue]);
  const { snapshot } = subscriptions.use(), nav = navigation.use();
  const [agentsOpen, setAgentsOpen] = useState(false);
  const initialSetupShown = useRef(false);
  useEffect(() => {
    if (scenarioName || !visible || initialSetupShown.current || !status || !sourcesLoaded || loading || error) return;
    initialSetupShown.current = true;
    if (!flow && !newConnection && !detailOpen && !sourceRecords.some(s => s.state !== "revoked" && !isPendingSource(s, status.ingresses))) openOnboarding("welcome");
  }, [visible, status, sourceRecords, sourcesLoaded, loading, error, flow, newConnection, detailOpen]);
  const sources = status?.ingresses ?? [];
  const controlSources = orderedSources().filter(s => s.state !== "revoked" && !isPendingSource(s, sources));
  const agents = orderedAgents()
    .filter((a) => a.installed && a.enabled === true)
    .filter((a, index) => index < ([4, 6, 8, 10].includes(max) ? max : 4) || a.agent === selection?.agent);
  const relays = useRelays();
  const publicId = publicRelay(relays.relays)?.ingressId;
  const basicConnections = sources.filter(entry => entry.transport === "local" || entry.id === publicId);
  const running = basicConnections.some((i) => i.running),
    progressing =
      !!busy || basicConnections.some((i) => ["starting", "stopping"].includes(i.state));
  function edit() { openOnboarding("product"); }
  async function toggle() {
    if (busy) return;
    if (
      !running &&
      (!basicConnections.length || basicConnections.every((i) => !i.config.configured))
    ) {
      edit();
      return;
    }
    await run("basic-connections", async () => {
      const failures: string[] = [];
      for (const entry of basicConnections) {
        try {
          if (!running && !entry.enabled) await api(`ingress/${entry.id}`, "PUT", { enabled: true });
          await api(`ingress/${entry.id}/${running ? "stop" : "start"}`, "POST"); }
        catch (error) { failures.push(`${entry.name}: ${String(error)}`); }
      }
      await refreshConnector();
      if (failures.length) throw new Error(failures.join("\n"));
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
  function agentState(a: Agent) { return projectAgentState(a, status); }
  function sourceState(i: Ingress) {
    if (!i.enabled) return "disabled";
    return error ? "unknown" : ingressState(i);
  }
  const core = useRef<HTMLElement>(null), topology = useRef<TopologyHandle>(null);
  const now = useAppNow(visible && Object.values(tracked).some(s => s.length) ? 1000 : null);
  useEffect(() => { if (status?.core.backendSession) resetActivityCore(status.core.backendSession); }, [status?.core.backendSession]);
  const selectedAgent = selection && (orderedAgents().find(a => a.agent === selection.agent) ?? { agent: selection.agent });
  const panelFrame = useCallback((rect: SurfaceRect | null) => topology.current?.panelFrame(rect), []);
  const [switchOn, setSwitchOn] = useState<boolean>();
  useEffect(() => { if (!progressing && status) setSwitchOn(running); }, [running, progressing, status]);
  function moveSource(id: string, by: number) {
    const ids = controlSources.map(source => source.id);
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
  const sourceViews: NodeView[] = controlSources.flatMap(source => {
    const ingress = sources.find(i => i.id === source.ingressId);
    if (!ingress) return [];
    const state = source.state === "disconnected" ? "disconnected" : sourceState(ingress);
    const selected = !sourceSelection?.closing && sourceSelection?.product === source.product;
    const platformLabel = controlSource(source.product)?.displayName ?? source.product;
    const nodeLabel = accounts.some(account => account.sources.includes(source.id)) ? platformLabel : source.label;
    return [{
      id: source.id, platform: source.product, platformLabel, label: nodeLabel,
      selectedAccountId: sourceSelection?.accountId, icon: <PlatformIcon role="source" platform={source.product} panelVisual />, sourceIds: [source.id], state: wireState(state), attention: false, selected, tasks: [], reorderable: !panelOpen,
      content: accounts.some(account => account.sources.includes(source.id)) ? <SrcPlatformNode product={source.product} state={wireState(state)} selected={selected} newlyAdded={source.id === newSourceId && !flow}
        onMove={panelOpen ? undefined : by => moveSource(source.id, by)}
        onOpen={() => selectSourcePanel(source.product, { toggle: true, sourceId: source.id })} />
        : <SrcAccountNode product={source.product} sourceLabel={source.label} state={wireState(state)} selected={selected} newlyAdded={source.id === newSourceId && !flow}
          onMove={panelOpen ? undefined : by => moveSource(source.id, by)}
          onOpen={() => selectSourcePanel(source.product, { toggle: true, sourceId: source.id })} />,
    }];
  });
  const agentViews: NodeView[] = agents.map(agent => {
    const sessions = orderActivity(tracked[agent.agent] ?? [], manualOrder[agent.agent] ?? []), selected = !selection?.closing && selection?.agent === agent.agent;
    const agentAccounts = accounts.filter(a => a.agentProfiles.some(p => p.agent === agent.agent));
    const sharedAccount = agentAccounts.length === 1 ? agentAccounts[0] : undefined;
    const accountIds = agentAccounts.map(a => a.id);
    const accountGroup = (id: string | null | undefined) => agentAccounts.find(account => accountOwns(account, id))?.id;
    const origin = (session: typeof sessions[number]) => session.origin && { ...session.origin,
      accountId: accounts.find(account => accountOwns(account, session.origin?.accountId))?.id ?? session.origin.accountId };
    const groups = accountIds.length > 1 ? [...new Set(sessions.map(s => accountGroup(s.agentAccountId)))].map(id => sessions.filter(s => accountGroup(s.agentAccountId) === id)) : [sessions];
    const queueKey = (group: typeof sessions) => JSON.stringify([agent.agent, accountIds.length > 1 ? accountGroup(group[0]?.agentAccountId) : null]);
    const shownGroups = groups.map(group => ({ ...visibleActivity(group, selected ? selection.session?.id : undefined, expandedQueue === queueKey(group)), group }));
    const shown = { sessions: shownGroups.flatMap(group => group.sessions) };
    const effectiveDensity = effectiveBubbleDensity(density, autoCompact, sessions.length);
    return {
      id: agent.agent, platform: agent.agent, platformLabel: name(agent), icon: <AgentQuotaIcon agent={agent.agent} quota={sharedAccount?.quota} />,
      selectedAccountId: accountGroup(selection?.accountId), state: wireState(agentState(agent)), attention: sessions.some(s => !!s.interaction), selected, reorderable: agent.enabled && !panelOpen,
      content: <AgentPlatformNode agent={agent} quota={sharedAccount?.quota} label={`${name(agent)}: ${t(agentState(agent))}`} state={wireState(agentState(agent))}
        onMove={agent.enabled && !panelOpen ? by => moveVisibleAgent(agent.agent, by) : undefined}
        selected={selected} onOpen={() => selectAgentPanel({ type: "toggle", agent: agent.agent, accountId: sharedAccount?.id })}>
        {selection && !selected && sessions.some(s => s.endedAt === undefined) && <span className="agent-task-count" data-attention={sessions.some(s => !!s.interaction) || undefined}>{sessions.filter(s => s.endedAt === undefined).length}</span>}
        {effectiveDensity !== density && <span className="agent-auto-compact">{t("activity.autoCompacted")}</span>}
      </AgentPlatformNode>,
      tasks: [
        ...shown.sessions.map(session => ({ id: JSON.stringify([agent.agent, session.id]), activityQueue: queueKey([session]), width, height: bubbleHeights[effectiveDensity], taskId: session.id, threadId: session.nativeSessionId, agentAccountId: accountGroup(session.agentAccountId) ?? session.agentAccountId, origin: origin(session),
          state: (session.endedAt !== undefined ? "completed" : session.interaction ? "attention" : session.source === "transcript" ? "external" : "running") as import("../topology/render").TaskState,
          selected: selected && selection.session?.id === session.id, reorderable: !panelOpen,
          content: <ActivityBubble agent={agent.agent} session={session} now={now} density={effectiveDensity} onRead={() => markRead(agent.agent, session.id)} onMove={panelOpen ? undefined : by => {
            const group = shown.sessions.filter(s => (accountIds.length <= 1 || accountGroup(s.agentAccountId) === accountGroup(session.agentAccountId)) && !!s.interaction === !!session.interaction);
            const from = group.findIndex(s => s.id === session.id), to = from + by;
            if (to < 0 || to >= group.length) return;
            const ids = group.map(s => s.id); ids.splice(from, 1); ids.splice(to, 0, session.id);
            reorderTasks(agent.agent, ids, sessions);
          }} />,
        })),
        ...shownGroups.flatMap(group => group.hidden ? [{ id: JSON.stringify(accountIds.length > 1 ? [agent.agent, null, accountGroup(group.group[0]?.agentAccountId)] : [agent.agent, null]), activityQueue: queueKey(group.group),
          members: group.group.filter(s => !group.sessions.includes(s)).map(s => ({ origin: origin(s), agentAccountId: accountGroup(s.agentAccountId) ?? s.agentAccountId, pending: !!s.interaction })),
          agentAccountId: accountIds.length > 1 ? accountGroup(group.group[0]?.agentAccountId) : undefined, count: group.hidden, pending: group.group.some(s => !!s.interaction && !group.sessions.includes(s)), width, height: bubbleHeights.compact, state: "summary" as const, selected: false,
          content: <Button variant="surface" type="button" className="activity-bubble activity-summary" aria-expanded={false} onClick={event => {
            setExpandedQueue(queueKey(group.group));
            if (event.detail === 0) {
              const next = group.group.find(session => !group.sessions.includes(session));
              requestAnimationFrame(() => [...(core.current?.querySelectorAll<HTMLButtonElement>("[data-activity-session]") ?? [])]
                .find(button => button.dataset.activitySession === JSON.stringify([agent.agent, next?.id]))?.focus());
            }
          }}>
            <PhaseTile phase="tool" animated={false} /><span className="activity-copy"><span className="activity-phase"><PhaseLabel phase="tool">{t("activity.more", { count: group.hidden })}</PhaseLabel></span><span className="activity-headline">{t("activity.viewAll")}</span></span>
          </Button>,
        }] : []),
      ],
    };
  });
  const openAccountNode = (side: -1 | 1, platform: string, sourceId?: string, accountId?: string) => {
    if (side === 1) {
      selectAgentPanel({ type: 'toggle', agent: platform, accountId });
    } else {
      const source = controlSources.find(s => s.id === sourceId);
      selectSourcePanel(platform, { toggle: true, sourceId: source?.id, accountId });
    }
  };
  const topologyLeft = accountViews(sourceViews, -1, accounts, mode, accountOrders, { open: openAccountNode });
  const topologyRight = accountViews(agentViews, 1, accounts, mode, accountOrders, { open: openAccountNode });
  const flatten = (nodes: NodeView[]): NodeView[] => nodes.flatMap(n => [n, ...flatten(n.children ?? [])]);
  const reorderNodes = (side: -1 | 1, ids: string[]) => {
    const nodes = flatten(side === -1 ? topologyLeft : topologyRight), first = nodes.find(n => n.id === ids[0]);
    if (first?.account) {
      topologyAccountOrder.set(old => ({ ...old, [`${side}:${first.platform}`]: ids.flatMap(id => nodes.find(n => n.id === id)?.accountId ?? []) }));
    } else if (side === -1) reorderSources(orderedSubset(controlSources, ids.flatMap(id => nodes.find(n => n.id === id)?.sourceIds ?? [id])).map(s => s.id));
    else reorderAgents(orderedSubset(agents.map(a => ({ id: a.agent })), ids).map(a => a.id));
  };
  return (
    <>
      <section ref={core} inert={flow?.step === "welcome"} aria-hidden={flow?.step === "welcome" || undefined} className={`connection-core brand-mode ${panelOpen ? "side-panel-open" : ""}`} aria-label={t("connectionStatus")}>
        <div className="core-toggle">
          <Button variant="surface"
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
          </Button>
        </div>
        <Topology ref={topology} boundary={core} accountsEnabled={accounts.length > 0} left={topologyLeft} right={topologyRight} panelKey={panelKey} panelExpanded={selection && envOverrides().taskPanelWidth != null ? false : panelExpanded} onPanelLayout={updatePanelLayout}
          onReorderNodes={reorderNodes}
          onReorderTasks={(_side, parent, ids) => {
            const agent = flatten(topologyRight).find(n => n.id === parent)?.platform ?? parent;
            reorderTasks(agent, ids.map(id => JSON.parse(id)[1] as string), tracked[agent] ?? []);
          }}
          brand={<Hub sourceEmpty={!sourceViews.length} agentEmpty={!agents.length}
            onAddSource={() => openOnboarding("product")}
            onManageAgents={() => setAgentsOpen(true)} />} />
        {selectedAgent && visible && (panelReady || selection?.closing || panelLayout.key?.startsWith("agent:")) && <AgentPanel agent={selectedAgent} dockRect={panelLayout.rect}
          width={envOverrides().taskPanelWidth ?? panelLayout.width} expanded={envOverrides().taskPanelWidth == null && panelLayout.expanded} onToggleWidth={() => setPanelExpanded(value => !value)}
           onPanelFrame={panelFrame} />}
        {sourceSelection && visible && (panelReady || sourceSelection.closing || panelLayout.key?.startsWith("source:")) && <IngressPanel dockRect={panelLayout.rect} width={panelLayout.width} expanded={panelLayout.expanded} onToggleWidth={() => setPanelExpanded(value => !value)} onPanelFrame={panelFrame} />}
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
      {flow && visible && <Onboarding />}
      {newConnection && visible && <SourceConnectionSetup options={newConnection} onClose={() => connectionSetup.set(undefined)} onAdded={id => {
        void relays.refresh().catch(() => {});
        if (newConnection.forSource) onboarding.set(old => old?.step === "connection" ? { ...old, step: "address", ingressId: id, baseline: (connector.get().status?.ingresses.find(i => i.id === id)?.oauth?.pending ?? []).map(p => p.id) } : old);
        connectionSetup.set(undefined);
      }} />}
      {agentsOpen && <AgentsSettings onClose={() => setAgentsOpen(false)} />}
    </>
  );
}
