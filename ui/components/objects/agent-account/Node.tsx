import type { ProviderAccount } from '../../../types';
import { name } from '../../../state/agents';
import type { WireState } from '../../../topology/render';
import GraphNode from '../../GraphNode';
import { AgentQuotaIcon } from '../../../subscriptions/QuotaRing';
export function AgentAccountNode({ account, agent, platformLabel = name({ agent }), flat, suffix, state, selected, onOpen, onMove }: { account: Pick<ProviderAccount, 'alias' | 'quota'>; agent: string; platformLabel?: string; flat?: boolean; suffix?: string; state: WireState; selected?: boolean; onOpen: () => void; onMove?: (by: number) => void }) {
  const title = `${flat ? `${platformLabel} · ` : ''}${account.alias}`, label = `${title}${suffix ? ` · ${suffix}` : ''}`;
  return <GraphNode label={label} state={state} highlighted={selected} onOpen={onOpen} onMove={onMove}><AgentQuotaIcon agent={agent} quota={account.quota ?? null} /><span className={`graph-node-name${suffix ? ' topology-unidentified-label' : ''}`}>{suffix ? <><span>{title}</span><span> · {suffix}</span></> : label}</span></GraphNode>;
}
