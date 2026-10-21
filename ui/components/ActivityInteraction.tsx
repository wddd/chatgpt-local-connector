import { useId, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { AgentActivitySession } from "../types";
import { t } from "../i18n";
import { activityApprovals, submitActivityApproval, submitActivityResponse } from "../state/activity";
import { interactionKey, permissionResponse, questionResponse } from "../state/activityModel";
import { Button, Field, Icon, Input, SingleChoice, Textarea, Tooltip } from "./ui";

export default function ActivityInteraction({ agent, session, questions = false }: {
  agent: string; session: AgentActivitySession; questions?: boolean;
}) {
  const submissions = activityApprovals.use();
  const submission = submissions[interactionKey(agent, session)];
  const [value, setValue] = useState("");
  const inputId = useId();
  const interaction = session.interaction;
  if (!interaction) return null;
  const feedback = submission?.status === "submitted" ? t("activity.submitted")
    : submission?.status === "unconfirmed" ? t("activity.unconfirmed") : "";
  const error = submission?.status === "failed" && <Tooltip text={`${t("activity.failed")} ${submission.error || ""}`}>
    <span className="activity-error" tabIndex={0} role="alert" aria-label={`${t("activity.failed")} ${submission.error || ""}`}><Icon icon={AlertCircle} /></span>
  </Tooltip>;
  if (interaction.kind === "permission") return <div className="activity-actions">
    <span className="activity-once">{t("timeline.allowOnce")}</span>
    {feedback ? <span role="status" title={submission?.error}>{feedback}</span> : <>
      {(["deny", "allow"] as const).map(decision => <Button key={decision} variant={decision === "allow" ? "primary" : "secondary"}
        disabled={!permissionResponse(interaction, decision) || (!!submission && submission.decision !== decision)}
        busy={submission?.status === "submitting" && submission.decision === decision}
        onClick={() => void submitActivityApproval(agent, session, decision)}>
        {submission?.decision === decision && submission.status === "pending" ? t("activity.checkResult") : t(`activity.${decision}`)}
      </Button>)}{error}
    </>}
  </div>;
  if (!questions || interaction.respond.args?.agent !== "pi" || interaction.canRespond === false)
    return <span className="activity-note">{t(questions ? (session.open ? "activity.questionOpen" : "timeline.responseUnavailable") : session.timeline ? "activity.questionTimeline" : session.open ? "activity.questionOpen" : "activity.questionPending")}</span>;
  if (feedback) return <span role="status" title={submission?.error}>{feedback}</span>;
  const options = Array.isArray(interaction.options) ? interaction.options.filter((o): o is string => typeof o === "string") : [];
  const submit = (cancelled: boolean) => {
    const payload = questionResponse(interaction, value, cancelled);
    if (payload) void submitActivityResponse(agent, session, cancelled ? "cancel" : "answer", payload);
  };
  return <form className="timeline-question" onSubmit={e => { e.preventDefault(); submit(false); }}>
    {interaction.method === "select"
      ? <SingleChoice label={interaction.summary} value={value} onChange={setValue} options={options.map(option => ({ value: option, label: option }))} disabled={!!submission} />
      : <Field label={t("timeline.answer")} id={inputId}>
        {interaction.method === "editor"
          ? <Textarea id={inputId} rows={4} value={value} onChange={e => setValue(e.target.value)} disabled={!!submission} />
          : <Input id={inputId} value={value} onChange={e => setValue(e.target.value)} disabled={!!submission} />}
      </Field>}
    <div className="actions">
      <Button type="submit" busy={submission?.status === "submitting" && submission.decision === "answer"}
        disabled={!questionResponse(interaction, value) || (!!submission && submission.decision !== "answer")}>
        {submission?.status === "pending" ? t("activity.checkResult") : t("timeline.submit")}</Button>
      <Button variant="ghost" onClick={() => submit(true)} busy={submission?.status === "submitting" && submission.decision === "cancel"}
        disabled={!!submission && submission.decision !== "cancel"}>{t("timeline.cancel")}</Button>{error}
    </div>
  </form>;
}
