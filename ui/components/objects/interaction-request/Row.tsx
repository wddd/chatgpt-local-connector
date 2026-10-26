import { Check, ShieldAlert } from 'lucide-react';
import { EntityRow, Icon } from '../../ui';
import { t } from '../../../i18n';
import type { AgentTimelineEntry } from '../../../types';
import type { TaskRecord } from '../../../state/tasks';
import type { ApprovalSubmission } from '../../../state/activityModel';
import { answerLabel, interactionSummary, interactionQuestions } from '../../../state/taskInteractions';
export function InteractionRequestRow({ entry, receipt }: { entry: AgentTimelineEntry; receipt?: ApprovalSubmission }) {
  const saved = entry.response;
  const own = !!saved || receipt?.status === "submitted";
  const resolved = own || entry.status === "completed";
  const answer = entry.interaction && interactionQuestions(entry.interaction).some(question => question.secret) ? "••••" : saved ? answerLabel({ op: "codex_respond", args: { result: saved.result } }) : receipt?.status === "submitted" ? answerLabel(receipt.payload) : "";
  const decision = saved?.result?.decision;
  const verdict = !own ? "timeline.resolved" : saved
    ? saved.skipped ? "detail.skipped" : decision ? ["decline", "cancel", "denied"].includes(decision) ? "detail.verdict.reject" : "detail.verdict.approved"
      : answer ? "timeline.answered" : "detail.skipped"
    : receipt?.decision === "deny" ? "detail.verdict.reject" : receipt?.decision === "allow" ? "detail.verdict.approved" : receipt?.decision === "cancel" ? "detail.skipped" : "timeline.answered";
  return <EntityRow className="interaction-request-row" attention={!resolved} leading={<Icon icon={resolved ? Check : ShieldAlert} />}
    title={resolved ? t(verdict) : t("detail.needsYou")}
    secondary={<>{interactionSummary(entry.interaction)}{answer && <> · {answer}</>}{resolved && <> · {saved ? saved.origin.controlSource === "ARC" ? t("detail.byARC") : saved.origin.sourceLabel || saved.origin.controlSource || t("detail.sourceUnknown") : own ? t("detail.byARC") : t("detail.resolvedElsewhere")}</>}</>} />;
}

export function AdmissionRequestRow({ record }: { record: TaskRecord }) {
  return <EntityRow title={record.task.title || record.task.prompt} state={t(record.approval.decision === 'approved' ? 'detail.verdict.approved' : record.approval.decision === 'bypass' ? 'detail.verdict.bypass' : 'detail.verdict.reject')} secondary={record.approval.source === 'local' ? t('detail.byARC') : record.origin?.sourceLabel || record.approval.source} />;
}
