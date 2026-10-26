import { Button, ActionGroup, SettingsSection, SettingRow, EntityCard, SectionHeader, Dialog, IconButton, Switch, Notice, Loading } from "./ui";
import { useReducedMotion } from "../state/appEnvironment";
import { useState, type ReactNode } from "react";
import { motion, Reorder, useDragControls } from "motion/react";
import { RefreshCw, Settings, Gauge } from "lucide-react";
import { t } from "../i18n";
import { openUrl } from "../platform";
import {
  agents,
  orderedAgents,
  moveAgent,
  reorderAgents,
  name,
  compactAgentVersion,
  agentLinks,
  toggleAgent,
  refreshAgents,
  type Agent,
} from "../state/agents";
import { subscriptions } from "../state/subscriptions";
import { AgentQuotaIcon } from "../subscriptions/QuotaRing";
import UsageOverview from "../subscriptions/UsageOverview";
import QuotaBubble from "../subscriptions/QuotaBubble";
import AgentDisplaySettings from "./AgentDisplaySettings";
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
    return <EntityCard asChild><motion.article className="agent-card" layout="position" transition={transition}>
      {children}
    </motion.article></EntityCard>;
  }
  return (
    <EntityCard asChild><Reorder.Item
      as="article"
      value={agent.agent}
      className="agent-card"
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
    </Reorder.Item></EntityCard>
  );
}

export function AgentDetails({
  agent: selected,
  onClose,
  showOfficialLink = false,
}: {
  agent: Agent;
  showOfficialLink?: boolean;
  onClose: () => void;
}) {
  const inventory = agents.use();
  const agent = inventory.items.find((item) => item.agent === selected.agent) || selected;
  const { snapshot } = subscriptions.use();
  const provider = snapshot?.settings.enabled
    ? snapshot.providers.find(
        (p) => p.agentIds.includes(agent.agent) && p.eligible,
      )
    : undefined;
  return (
    <Dialog title={name(agent)} onClose={onClose} headerless width={440}>
      <SectionHeader className="agent-summary" level={2} leading={<><AgentQuotaIcon agent={agent.agent} /></>} title={<>{name(agent)}</>} secondary={<>{agent.installed !== undefined && <p title={agent.version || undefined}>{agent.installed ? compactAgentVersion(agent.version) : t("agentNotInstalled")}</p>}</>} />
      {showOfficialLink && agentLinks[agent.agent] && <a href={agentLinks[agent.agent]} onClick={e => { e.preventDefault(); void openUrl(agentLinks[agent.agent]!); }}>{t("officialSetup")}</a>}
      {agent.installed !== undefined && agent.discoveryError && agent.discoveryError !== "AGENT_NOT_INSTALLED" &&
        <Notice>{agent.discoveryError}</Notice>}
      {provider && <QuotaBubble provider={provider} />}
    </Dialog>
  );
}
export default function AgentsSettings({ onClose, initialAgent }: { onClose: () => void; initialAgent?: Agent }) {
  const state = agents.use(),
    items = orderedAgents();
  const [detail, setDetail] = useState<Agent | undefined>(initialAgent),
    [display, setDisplay] = useState(false),
    [overview, setOverview] = useState(false),
    [error, setError] = useState("");
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
            <IconButton icon={Gauge} label={t("trayUsage")} onClick={() => setOverview(true)} />
            <IconButton
              icon={Settings}
              label={t("agentDisplaySettings")}
              onClick={() => setDisplay(true)}
            />
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
          className="agent-grid"
          values={items.filter(canReorder).map(agent => agent.agent)}
          onReorder={reorderAgents}
        >
          {items.filter(agent => agent.installed).map((agent) => (
            <AgentCard
              key={agent.agent}
              agent={agent}
              onMove={by => move(agent.agent, by)}
            >
              <Button variant="surface"
                type="button"
                className="agent-detail-trigger"
                aria-label={name(agent)}
                aria-haspopup="dialog"
                onClick={() => setDetail(agent)}
              >
                <AgentQuotaIcon agent={agent.agent} />
              </Button>
              <SettingRow label={<>
                {agentLinks[agent.agent] ? (
                  <a
                    href={agentLinks[agent.agent]}
                    draggable={false}
                    onClick={(e) => {
                      e.preventDefault();
                      void openUrl(agentLinks[agent.agent]!).catch((e) =>
                        setError(String(e)),
                      );
                    }}
                  >
                    {name(agent)}
                  </a>
                ) : (
                  <strong>{name(agent)}</strong>
                )}
              </>} description={<span title={agent.version || undefined}>{agent.installed ? compactAgentVersion(agent.version) : t("agentNotInstalled")}</span>}>
              {agent.installed && (
                <Switch
                  label={t("allowConnectorToUseValue", { agent: name(agent) })}
                  checked={agent.enabled === true}
                  disabled={
                    !!state.saving ||
                    state.loading ||
                    agent.adapter?.state === "preparing" ||
                    typeof agent.enabled !== "boolean"
                  }
                  onChange={(enabled) => void toggleAgent(agent, enabled)}
                />
              )}
              </SettingRow>
              {agent.installed &&
                agent.adapter &&
                agent.adapter.state !== "ready" && (
                  <p
                    className="agent-adapter"
                    role={agent.adapter.state === "failed" ? "alert" : "status"}
                  >
                    {t(
                      agent.adapter.state === "preparing"
                        ? "agentAdapterPreparing"
                        : agent.adapter.state === "failed"
                          ? "agentAdapterFailed"
                          : "agentAdapterMissing",
                    )}
                    {agent.adapter.error &&
                      ` · ${t({ CLAUDE_ADAPTER_DOWNLOAD_FAILED: "agentAdapterDownloadFailed", CLAUDE_ADAPTER_CHECKSUM_FAILED: "agentAdapterChecksumFailed", CLAUDE_ADAPTER_EXTRACT_FAILED: "agentAdapterExtractFailed", CLAUDE_ADAPTER_PROBE_FAILED: "agentAdapterProbeFailed" }[agent.adapter.error] || "agentAdapterSetupFailed")}`}
                  </p>
                )}
            </AgentCard>
          ))}
        </Reorder.Group>
        </SettingsSection>}
        {items.some((agent) => !agent.installed) && <SettingsSection title={t("notInstalledAgents")}>
        <div className="uninstalled-agents">
          {items.filter(agent => !agent.installed).map(agent => (
            <a
              key={agent.agent}
              className="agent-uninstalled"
              href={agentLinks[agent.agent]}
              onClick={(event) => {
                event.preventDefault();
                void openUrl(agentLinks[agent.agent]!).catch(error => setError(String(error)));
              }}
            >
              <AgentQuotaIcon agent={agent.agent} />
              <span>{name(agent)}</span>
            </a>
          ))}
        </div>
        </SettingsSection>}
        {(error || state.error) && <Notice>{error || state.error}</Notice>}
      </Dialog>
      {detail && (
        <AgentDetails showOfficialLink agent={detail} onClose={() => setDetail(undefined)} />
      )}{" "}
      {overview && <Dialog title={t("trayUsage")} onClose={() => setOverview(false)} width={440}>
        <UsageOverview onNavigate={() => { setOverview(false); setDisplay(true); }} />
      </Dialog>}
      {display && <AgentDisplaySettings onClose={() => setDisplay(false)} />}
    </>
  );
}
