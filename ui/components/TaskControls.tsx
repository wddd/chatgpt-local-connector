import { useEffect, useId, useState } from "react";
import { ChevronDown, Square } from "lucide-react";
import { t } from "../i18n";
import { taskPurposes, taskPurposeKey, setTaskPurpose, type TaskPurpose } from "../state/taskPurpose";
import { taskPurposeArgs } from "../state/taskControlModel";
import type { TaskState } from "../state/taskProjection";
import type { TaskControl } from "../state/taskControl";
import { Button, Field, IconButton, Menu, SingleChoice, Textarea } from "./ui";

export default function TaskControls({ agent, taskId, state, control, turnId, reviewRequired }: { agent: string; taskId: string; state: TaskState; control: TaskControl; turnId?: string; reviewRequired: boolean }) {
  const id = useId();
  const purpose = taskPurposes.use()[taskPurposeKey(agent, taskId)] ?? "inherit";
  const [text, setText] = useState(""), [rework, setRework] = useState(false);
  const live = state === "running" || state === "needsYou";
  const canSend = !live || agent === "codex";
  const reviewed = reviewRequired ? control.review?.verdict : undefined;
  useEffect(() => setRework(false), [turnId, reviewRequired]);
  useEffect(() => {
    if (control.operation?.intent === "send" && control.operation.receipt?.state === "completed") { setText(""); setRework(false); }
  }, [control.operation]);
  const send = async (steer = false) => {
    if (!text.trim() || control.outstanding) return;
    if (reviewRequired && rework && reviewed !== "rework" && !await control.perform("review", { verdict: "rework", note: text.slice(0, 1000) })) return;
    if (await control.perform("send", { prompt: text, ...taskPurposeArgs(purpose), ...(agent === "codex" ? { sendMode: steer ? "steer" : "next" } : {}) })) { setText(""); setRework(false); }
  };
  return <section className="task-controls">
    {reviewRequired && state === "done" && !reviewed && !rework ? <div className="task-review-dock"><strong>{t("detail.reviewTurn")}</strong><div className="actions"><Button variant="secondary" disabled={control.outstanding || !turnId} onClick={() => setRework(true)}>{t("detail.rework")}</Button><Button disabled={control.outstanding || !turnId} busy={control.busy} onClick={() => void control.perform("review", { verdict: "pass" })}>{t("detail.pass")}</Button></div></div> : <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <SingleChoice compact label={t("detail.purpose")} value={purpose} disabled={control.outstanding} onChange={value => setTaskPurpose(agent, taskId, value as TaskPurpose)} options={[{ value: "inherit", label: t("detail.purposeInherit") }, { value: "task", label: t("detail.purposeTask") }, { value: "self-test", label: t("detail.purposeSelfTest") }]} />
      <div className="task-compose-row"><Field id={id} label={t(rework ? "detail.reworkPrompt" : "detail.message")}><Textarea id={id} rows={2} value={text} onChange={event => setText(event.target.value)} disabled={control.outstanding || !canSend} placeholder={t(rework ? "detail.reworkPrompt" : live && agent === "codex" ? "detail.queueHint" : "detail.followUp")} /></Field>
        <Button type="submit" disabled={!text.trim() || control.outstanding || !canSend} busy={control.busy}>{t("detail.send")}</Button>
        {live && agent === "codex" && <Menu label={t("detail.sendOptions")} trigger={<IconButton icon={ChevronDown} label={t("detail.sendOptions")} disabled={control.outstanding} />} items={[{ label: t("detail.steer"), disabled: !text.trim() || control.outstanding, action: () => void send(true) }]} />}
        {live && <IconButton icon={Square} label={t("detail.stop")} disabled={control.outstanding || agent === "codex" && !turnId} onClick={() => void control.perform("interrupt")} />}
      </div>
      {rework && <Button variant="ghost" onClick={() => setRework(false)} disabled={control.outstanding}>{t("cancel")}</Button>}
      {reviewed === "pass" && control.review?.reviewer?.controlSource === "ARC" && <Button variant="ghost" disabled={control.busy} onClick={() => void control.undo()}>{t("detail.undo")}</Button>}
    </form>}
    {control.operation?.receipt?.state === "completed" && control.operation.intent !== "review" && <p role="status">{t(control.operation.intent === "interrupt" ? "detail.stopRequested" : "detail.sendAccepted")}</p>}
    {!canSend && <p>{t("detail.sendWhenIdle")}</p>}
    {control.feedback && <p role="status">{control.feedback}</p>}
    {control.reviewError && <p role="alert">{control.reviewError}</p>}
    {control.outstanding && !control.busy && <Button variant="secondary" onClick={() => void control.check()}>{t("activity.checkResult")}</Button>}
  </section>;
}
