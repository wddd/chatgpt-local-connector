import { AgentPlatformCard, AgentPlatformRow } from './objects/agent-platform';
import { ActionGroup, SettingsSection, Dialog, IconButton, Switch, Notice, Loading } from "./ui";
import { useReducedMotion } from "../state/appEnvironment";
import { useState, type ReactNode } from "react";
import { motion, Reorder, useDragControls } from "motion/react";
import { RefreshCw } from "lucide-react";
import { t } from "../i18n";
import { openUrl } from "../platform";
import {
  agents,
  orderedAgents,
  moveAgent,
  reorderAgents,
  name,
  agentLinks,
  toggleAgent,
  refreshAgents,
  type Agent,
} from "../state/agents";
import { springTransition } from "../motion/geometry";

const canReorder = (agent: Agent) =>
  agent.installed === true && agent.enabled === true;

function AgentCard({ agent, onMove, children }: {
  agent: Agent;
  onMove: (by: number) => void;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : springTransition(0.3, 0.9);
  if (!canReorder(agent)) {
    return <motion.article className="min-w-0 rounded-lg" layout="position" transition={transition}>
      {children}
    </motion.article>;
  }
  return (
    <Reorder.Item
      as="article"
      value={agent.agent}
      className="min-w-0 touch-none cursor-grab rounded-lg select-none focus-visible:outline-2 focus-visible:outline-ring"
      data-reorderable
      tabIndex={0}
      aria-label={t("reorderAgent", { agent: name(agent) })}
      layout="position"
      transition={transition}
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      dragElastic={!reduced}
      whileDrag={{ cursor: "grabbing", boxShadow: "var(--shadow)" }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary ||
          (event.target as Element).closest("button, a, input, select, textarea, [role='button'], [role='switch']")) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        controls.start(event);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          onMove(["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1);
        }
      }}
    >
      {children}
    </Reorder.Item>
  );
}

export default function AgentsSettings({ onClose }: { onClose: () => void }) {
  const state = agents.use(),
    items = orderedAgents();
  const [error, setError] = useState('');
  function move(id: string, by: number) {
    const list = items.filter(canReorder),
      index = list.findIndex((a) => a.agent === id);
    if (list[index + by]) moveAgent(id, list[index + by]!.agent);
  }
  return (
    <>
      <Dialog
        title={t("agents")}
        onClose={onClose}
        wide
        actions={
          <ActionGroup>
            <IconButton
              icon={RefreshCw}
              label={t("refreshAgents")}
              busy={state.loading}
              disabled={!!state.saving}
              onClick={() => void refreshAgents(true)}
            />
          </ActionGroup>
        }
      >
        {!state.loaded && state.loading && <Loading />}
        {items.some((agent) => agent.installed) && <SettingsSection title={t("installedAgents")}>
        <Reorder.Group
          as="div"
          axis="xy"
          className="mb-4 grid grid-cols-1 gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3"
          values={items.filter(canReorder).map(agent => agent.agent)}
          onReorder={reorderAgents}
        >
          {items.filter(agent => agent.installed).map((agent) => (
            <AgentCard
              key={agent.agent}
              agent={agent}
              onMove={by => move(agent.agent, by)}
            >
              <AgentPlatformCard agent={agent} frame="catalog" quota={null} onLink={url => void openUrl(url).catch(error => setError(String(error)))}
                headerActions={<Switch label={t("allowConnectorToUseValue", { agent: name(agent) })} checked={agent.enabled === true}
                  disabled={!!state.saving || state.loading || agent.adapter?.state === "preparing" || typeof agent.enabled !== "boolean"}
                  onChange={enabled => void toggleAgent(agent, enabled)} />} />
            </AgentCard>
          ))}
        </Reorder.Group>
        </SettingsSection>}
        {items.some((agent) => !agent.installed) && <SettingsSection title={t("notInstalledAgents")}>
        <div className="grid grid-cols-1 gap-1 @lg:grid-cols-2 @3xl:grid-cols-3">
          {items.filter(agent => !agent.installed).map(agent => (
            <AgentPlatformRow key={agent.agent} agent={agent} onOpen={agentLinks[agent.agent] ? () => void openUrl(agentLinks[agent.agent]!).catch(error => setError(String(error))) : undefined} />
          ))}
        </div>
        </SettingsSection>}
        {(error || state.error) && <Notice>{error || state.error}</Notice>}
      </Dialog>
    </>
  );
}
