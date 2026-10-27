import type { AgentInteraction } from '../../../types';
import type { ApprovalDecision, ApprovalPayload, ApprovalSubmission } from '../../../state/activityModel';
import { permissionResponse } from '../../../state/activityModel';
import { inputResponse, interactionQuestions } from '../../../state/taskInteractions';
import { taskErrorText } from '../../../state/taskErrors';
import { t } from '../../../i18n';
import { Button, StateBadge, Tooltip } from '../../ui';
import { Sensitive, useSensitiveText } from '../../Sensitive';
import { RequestCard, type RequestCardProps } from '../../composites/RequestCard';
import { statePresentation } from '../statePresentation';
import { QuestionField } from './QuestionField';

export type InteractionRequestCardProps = {
  interaction: AgentInteraction; submission?: ApprovalSubmission;
  answers: Record<string, string[]>; onAnswersChange: (answers: Record<string, string[]>) => void;
  onRespond: (decision: ApprovalDecision, payload: ApprovalPayload) => void;
} & Pick<RequestCardProps, 'pager' | 'focusKey' | 'onClose' | 'inline'>;
export function InteractionRequestCard({ interaction, submission, answers, onAnswersChange, onRespond, ...frame }: InteractionRequestCardProps) {
  const protect = useSensitiveText([interaction.path ?? '', interaction.cwd ?? '']);
  const question = interaction.kind === 'question', locked = !!submission;
  const terminal = submission?.status === 'submitted' || submission?.status === 'unconfirmed';
  const supported = question ? !!inputResponse(interaction, {}, true, t('detail.skippedAnswer')) : !!permissionResponse(interaction, 'allow');
  function send(skip: boolean) {
    const payload = inputResponse(interaction, answers, skip, t('detail.skippedAnswer'));
    if (payload && !terminal) onRespond(skip ? 'cancel' : 'answer', payload);
  }
  function decide(decision: 'allow' | 'deny') {
    const payload = permissionResponse(interaction, decision);
    if (payload && !terminal) onRespond(decision, payload);
  }
  const footer = question ? <><Button variant="ghost" disabled={!supported || locked && submission.decision !== 'cancel' || terminal} onClick={() => send(true)}>{t('detail.skip')}</Button><Button type="submit" disabled={!inputResponse(interaction, answers) || locked && submission.decision !== 'answer' || terminal} busy={submission?.status === 'submitting'}>{t(submission?.status === 'pending' || submission?.status === 'failed' ? 'activity.checkResult' : 'detail.sendAnswer')}</Button></>
    : !terminal && <><span className="activity-once flex-1 basis-full text-muted-foreground">{t('timeline.allowOnce')}</span><Button disabled={!permissionResponse(interaction, 'deny') || locked && submission.decision !== 'deny'} onClick={() => decide('deny')}>{t('detail.reject')}</Button><Tooltip text={t('detail.nativeBypassUnavailable')}><span tabIndex={0}><Button disabled>{t('detail.bypass')}</Button></span></Tooltip><Button disabled={!supported || locked && submission.decision !== 'allow'} onClick={() => decide('allow')}>{t('detail.approve')}</Button></>;
  return <RequestCard {...frame} title={protect(interaction.title || interaction.summary || t('detail.needsYou'))} busy={submission?.status === 'submitting'}
    onSubmit={question ? event => { event.preventDefault(); send(false); } : undefined} footer={footer}
    state={submission && <StateBadge variant="text" presentation={statePresentation('submission', submission.status)} />}
    error={submission?.status === 'failed' ? taskErrorText(submission.error) : undefined}>
    {question ? <div className="task-question-options grid min-w-0 gap-3">{interactionQuestions(interaction).map(item => <QuestionField key={item.id} question={item} value={answers[item.id] ?? []} onChange={value => onAnswersChange({ ...answers, [item.id]: value })} disabled={locked || !supported} />)}</div>
      : <div className="task-request-preview flex min-w-0 flex-col gap-2.5 [&>*]:shrink-0 [&>p]:m-0 [&>pre]:m-0 [&>pre]:rounded-xl [&>pre]:bg-muted [&>pre]:p-2.5 [&>pre]:font-mono [&>pre]:text-xs [&>pre]:whitespace-pre-wrap [&>pre]:wrap-anywhere">{(interaction.command || interaction.preview || interaction.path) && <pre>{protect(interaction.command || interaction.preview || interaction.path || "")}</pre>}{interaction.cwd && <div className="mono font-mono">{t('timeline.cwd')} · <Sensitive wrap>{interaction.cwd}</Sensitive></div>}{interaction.reason && <p>{protect(interaction.reason)}</p>}</div>}
    {!supported && <p>{t('timeline.responseUnavailable')}</p>}
  </RequestCard>;
}
