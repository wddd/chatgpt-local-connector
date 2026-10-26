import { AlertCircle, ArrowRightLeft, Ban, Check, Circle, CircleHelp, Clock, KeyRound, Loader, MessageCircle, Pause, Power, Unplug } from 'lucide-react';
import type { StatePresentation } from '../ui/Shells';

const entry = (tone: StatePresentation['tone'], labelKey: string, icon: StatePresentation['icon']): StatePresentation => ({ tone, labelKey, icon });
const unknown = entry('neutral', 'detail.state.unknown', CircleHelp);
const connection = {
  connected: entry('success', 'connected', Check), connectingLabel: entry('neutral', 'connectingLabel', Loader),
  connectionError: entry('danger', 'connectionError', AlertCircle), disabled: entry('neutral', 'disabled', Power),
  disconnected: entry('neutral', 'disconnected', Unplug), unknown,
};
const states = {
  source: { connected: entry('success', 'source.state.connected', Check), disconnected: entry('neutral', 'source.state.disconnected', Unplug), revoked: entry('danger', 'source.state.revoked', Ban), 'pending-switch': entry('warning', 'switch.pending', ArrowRightLeft), unknown },
  connection,
  agent: { ...connection, agentAvailable: entry('success', 'agentAvailable', Check), preparing: entry('neutral', 'preparing', Loader) },
  account: { ready: entry('success', 'accounts.health.ready', Check), attention: entry('warning', 'accounts.attention', AlertCircle), removed: entry('danger', 'accounts.health.removed', Ban), invalid: entry('danger', 'accounts.health.invalid', Ban), unknown },
  profile: { 'signed-in': entry('success', 'accounts.profile.signed-in', Check), 'signed-out': entry('warning', 'accounts.profile.signed-out', AlertCircle), unfinished: entry('warning', 'accounts.profile.unfinished', AlertCircle), invalid: entry('danger', 'accounts.profile.invalid', Ban), removed: entry('danger', 'accounts.health.removed', Ban), unknown },
  task: { running: entry('neutral', 'detail.state.running', Loader), needsYou: entry('warning', 'detail.state.needsYou', MessageCircle), done: entry('success', 'detail.state.done', Check), failed: entry('danger', 'detail.state.failed', AlertCircle), interrupted: entry('warning', 'detail.state.interrupted', Pause), unknown },
  dispatch: { running: entry('neutral', 'sourcePanel.running', Loader), pending: entry('warning', 'sourcePanel.pending', Clock), completed: entry('success', 'sourcePanel.completed', Check), failed: entry('danger', 'sourcePanel.failed', AlertCircle), unknown: entry('neutral', 'sourcePanel.unknown', CircleHelp) },
  permission: { granted: entry('success', 'permissionState.granted', Check), missing: entry('warning', 'permissionState.missing', Circle), unknown: entry('neutral', 'permissionState.unknown', CircleHelp) },
  submission: { submitting: entry('neutral', 'activity.submitting', Loader), pending: entry('neutral', 'activity.checkResult', Loader), submitted: entry('success', 'activity.submitted', Check), failed: entry('danger', 'activity.submissionFailed', AlertCircle), unconfirmed: entry('warning', 'activity.unconfirmed', CircleHelp), unknown },
  authorization: { pending: entry('warning', 'authorization.pending', KeyRound), approved: entry('success', 'authorization.approved', Check), denied: entry('danger', 'authorization.denied', Ban), expired: entry('neutral', 'authorization.expired', Clock), unknown },
  member: { online: entry('success', 'connect.online', Check), offline: entry('neutral', 'connect.offline', Circle), unknown },
  deployment: { idle: entry('neutral', 'connect.phase.idle', Circle), login: entry('warning', 'connect.phase.login', KeyRound), deploying: entry('neutral', 'connect.phase.deploying', Loader), connecting: entry('neutral', 'connect.phase.connecting', Loader), ready: entry('success', 'connect.phase.ready', Check), failed: entry('danger', 'connect.actionFailed', AlertCircle), cancelled: entry('neutral', 'connect.cancelled', Ban), unknown },
} satisfies Record<string, Record<string, StatePresentation>>;

/** Input is the owning domain's projection, never a raw transport/receipt state. */
export function statePresentation(domain: keyof typeof states, projectedState: string | null | undefined): StatePresentation {
  const domainStates: Record<string, StatePresentation> = states[domain];
  return projectedState && Object.hasOwn(domainStates, projectedState) ? domainStates[projectedState] : domainStates.unknown;
}
