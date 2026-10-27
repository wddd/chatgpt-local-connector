import { ActionGroup, SettingsSection, Dialog, IconButton, Switch, Notice, Loading, PlatformIcon, Button } from './ui';
import { useReducedMotion } from '../state/appEnvironment';
import { useRef, useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { GripVertical, RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import { openUrl } from '../platform';
import { agents, orderedAgents, reorderAgents, compactAgentVersion, name, agentLinks, toggleAgent, refreshAgents, type Agent } from '../state/agents';

function AgentRow({ agent, onMove, onDrop, disabled }: {
  agent: Agent; onMove: (by: number) => void; onDrop: () => void; disabled: boolean;
}) {
  const controls = useDragControls(), reduced = useReducedMotion();
  return <Reorder.Item as="div" value={agent.agent} layout="position" dragListener={false} dragControls={controls}
    dragMomentum={false} dragElastic={0} onDragEnd={onDrop} transition={{ duration: reduced ? 0 : 0.16 }}
    className="relative flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 focus-within:z-10">
    <PlatformIcon role="agent" platform={agent.agent} size={24} />
    <strong className="min-w-0 flex-1 text-sm">{name(agent)}</strong>
    <span className="text-xs text-muted-foreground" title={agent.version ?? undefined}>{compactAgentVersion(agent.version)}</span>
    <Switch label={t('allowConnectorToUseValue', { agent: name(agent) })} checked={agent.enabled === true}
      disabled={disabled || agent.adapter?.state === 'preparing' || typeof agent.enabled !== 'boolean'}
      onChange={enabled => void toggleAgent(agent, enabled)} />
    <Button variant="ghost" aria-label={t('reorderAgent', { agent: name(agent) })} disabled={disabled}
      className="size-7 shrink-0 touch-none cursor-grab p-1 active:cursor-grabbing"
      onPointerDown={event => { if (event.button === 0 && event.isPrimary && !disabled) { event.currentTarget.focus({ preventScroll: true }); controls.start(event); } }}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onMove(event.key === 'ArrowUp' ? -1 : 1); } }}>
      <GripVertical className="size-4" strokeWidth={1.75} />
    </Button>
  </Reorder.Item>;
}

export default function AgentsSettings({ onClose }: { onClose: () => void }) {
  const state = agents.use(), items = orderedAgents(), installed = items.filter(agent => agent.installed);
  const [draft, setDraft] = useState<string[]>(), draftRef = useRef<string[] | undefined>(undefined);
  const [error, setError] = useState('');
  const ids = draft ?? installed.map(agent => agent.agent);
  const rows = ids.map(id => installed.find(agent => agent.agent === id)).filter((agent): agent is Agent => !!agent);
  function drop() {
    if (draftRef.current) reorderAgents(draftRef.current);
    draftRef.current = undefined; setDraft(undefined);
  }
  function move(id: string, by: number) {
    const next = [...ids], index = next.indexOf(id), target = index + by;
    if (index < 0 || target < 0 || target >= next.length) return;
    next.splice(index, 1); next.splice(target, 0, id); reorderAgents(next);
  }
  return <Dialog title={t('agents')} onClose={onClose} actions={<ActionGroup>
    <IconButton icon={RefreshCw} label={t('refreshAgents')} busy={state.loading} disabled={!!state.saving || !!draft} onClick={() => void refreshAgents(true)} />
  </ActionGroup>}>
    {!state.loaded && state.loading && <Loading />}
    {!!installed.length && <SettingsSection title={t('installedAgents')}>
      <Reorder.Group as="div" axis="y" className="flex flex-col gap-2" values={ids}
        onReorder={next => { draftRef.current = next; setDraft(next); }}>
        {rows.map(agent => <AgentRow key={agent.agent} agent={agent} onDrop={drop} onMove={by => move(agent.agent, by)} disabled={!!state.saving || state.loading} />)}
      </Reorder.Group>
    </SettingsSection>}
    {items.some(agent => !agent.installed) && <SettingsSection title={t('notInstalledAgents')}>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {items.filter(agent => !agent.installed).map(agent => agentLinks[agent.agent]
          ? <a key={agent.agent} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={agentLinks[agent.agent]} onClick={event => { event.preventDefault(); void openUrl(agentLinks[agent.agent]!).catch(error => setError(String(error))); }}>{name(agent)}</a>
          : <span key={agent.agent} className="text-muted-foreground">{name(agent)}</span>)}
      </div>
    </SettingsSection>}
    {(error || state.error) && <Notice>{error || state.error}</Notice>}
  </Dialog>;
}
