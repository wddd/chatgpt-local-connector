import type { ComponentProps } from 'react';
import type { AgentActivitySession, AgentTimelineEntry } from '../../../types';
import { activityApprovals, submitActivityResponse } from '../../../state/activity';
import { interactionKey } from '../../../state/activityModel';
import { InteractionRequestCard } from './Card';
import { InteractionRequestRow } from './Row';

export function LiveInteractionRequestCard({ agent, session, ...props }: Omit<ComponentProps<typeof InteractionRequestCard>, 'interaction' | 'submission' | 'onRespond'> & { agent: string; session: AgentActivitySession }) {
  const submission = activityApprovals.use()[interactionKey(agent, session)];
  return session.interaction && <InteractionRequestCard {...props} interaction={session.source === "transcript" ? { ...session.interaction, canRespond: false } : session.interaction} submission={submission} onRespond={(decision, payload) => void submitActivityResponse(agent, session, decision, payload)} />;
}

export function LiveInteractionRequestRow({ entry, agent, session }: { entry: AgentTimelineEntry; agent: string; session: AgentActivitySession }) {
  const receipt = activityApprovals.use()[interactionKey(agent, { ...session, phaseSince: entry.startedAt, interaction: entry.interaction })];
  return <InteractionRequestRow entry={entry} receipt={receipt} />;
}
