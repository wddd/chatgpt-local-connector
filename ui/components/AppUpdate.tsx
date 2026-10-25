import { useState } from "react";
import { Popover } from "radix-ui";
import { ArrowUp, Check, LoaderCircle, X } from "lucide-react";
import { t } from "../i18n";
import { copyText, isDesktop } from "../platform";
import { connector, notify } from "../state/connector";
import { navigation } from "../state/navigation";
import { agentActivity } from "../state/activity";
import { useInterval } from "../state/hooks";
import { updates, available, updateVisible, checkUpdate, showUpdate, dismissUpdate, installUpdate, scheduleUpdate, skipUpdate, cancelDownload, dismissOutcome, retryUpdate, submitLocal, openReleaseNotes, updateAutomatic, acceptLocal, resumeInterrupted, controlScheduling } from "../state/updates";
import { updateActive, updateCountdown, updateStep, type UpdateSnapshot, type UpdateTiming, type UpdateWork } from "../state/updateModel";
import { Button, Group, Row, Notice, Progress, Icon, IconButton, SingleChoice, Switch } from "./ui";
import TaskQuestion from "./TaskQuestion";
import ActivityInteraction from "./ActivityInteraction";
import "./AppUpdate.css";

const action = (promise: Promise<unknown>) => void promise.catch(error => notify(String(error), true));
async function reveal(path: string) {
  if (isDesktop) { const { revealItemInDir } = await import("@tauri-apps/plugin-opener"); await revealItemInDir(path); }
}
function Identity({ job }: { job: UpdateSnapshot }) {
  return <><strong>{t(job.source?.kind === "local" ? "updates.localVersion" : "updates.releaseVersion", { version: job.source?.version ?? "—" })}</strong>
    {job.source?.kind === "local" && job.source.build && <code>{job.source.branch ? `${job.source.branch} @ ` : ""}{job.source.build.slice(0, 8)}</code>}
    {!!job.source?.landedLanes?.length && <span>{job.source.landedLanes.join(", ")}</span>}</>;
}
function WorkItem({ item, answerable }: { item: UpdateWork; answerable: boolean }) {
  const activity = agentActivity.use().snapshot;
  const session = item.agent ? activity?.agents[item.agent]?.sessions.find(session => session.id === item.taskId) : undefined;
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  return <li>
    <div className="update-work-title"><span>{item.title || session?.title || item.taskId || t(`updates.work.${item.kind}`)}</span>{item.count !== undefined && <span>{item.count}</span>}</div>
    {answerable && session?.interaction && (session.interaction.kind === "question"
      ? <TaskQuestion key={JSON.stringify(session.interaction.respond)} agent={item.agent!} session={session} answers={answers} onAnswersChange={setAnswers} />
      : <ActivityInteraction agent={item.agent!} session={session} />)}
  </li>;
}
function WorkGroups({ job }: { job: UpdateSnapshot }) {
  return <>{(["blocking", "willResume", "unaffected", "stale"] as const).map(group => {
    const items = job.work[group] ?? [];
    if (group === "stale" && !items.length) return null;
    return <section key={group} className="update-work-group" aria-label={t(`updates.${group}`)}>
      <h3>{t(`updates.${group}`)} <span>{items.length}</span></h3>
      {!!items.length && <ul>{items.map((item, index) => <WorkItem key={`${item.agent}:${item.taskId}:${index}`} item={item} answerable={group === "blocking"} />)}</ul>}
    </section>;
  })}</>;
}
function Steps({ job }: { job: UpdateSnapshot }) {
  const step = updateStep(job);
  return <ol className="update-steps" aria-label={t("updates.progress")}>
    {["verify", "backup", "settle", "restart", "health", "resume"].map((name, index) => <li key={name} data-complete={index < step || undefined} aria-current={index === step ? "step" : undefined}>
      <span>{index < step ? <Icon icon={Check} /> : index + 1}</span>{t(`updates.step.${name}`)}
    </li>)}
  </ol>;
}
function PanelContents() {
  const s = updates.use(), job = s.snapshot;
  const [selection, setSelection] = useState<UpdateTiming | undefined>();
  const timing = job.supported === false ? "now" : selection ?? job.when;
  const [clock, setClock] = useState(Date.now());
  useInterval(() => setClock(Date.now()), 250);
  const seconds = updateCountdown(job, clock);
  const advancing = ["countdown", "swapping", "starting", "verifying", "resuming", "rolling-back"].includes(job.state);
  const canSchedule = !!job.id && job.canSchedule !== false && ["settling", "countdown", "verifying"].includes(job.state);
  const downloading = job.state === "downloading";
  const primary = () => available() ? installUpdate(timing) : scheduleUpdate(timing === "now" ? "now" : "defer", timing === "settled" ? 1 : undefined);
  return <>
    <header className="update-panel-header"><div><Identity job={job} /></div><IconButton icon={X} label={t("close")} onClick={dismissUpdate} /></header>
    {advancing ? <div className="update-countdown" role="status" aria-live="polite">
      <h2>{seconds === undefined ? t(`updates.state.${job.state}`) : t("replacementCountdown", { seconds })}</h2>
      <Steps job={job} />
    </div> : <div className="update-columns">
      <section className="update-notes" aria-label={t(job.source?.kind === "local" ? "updates.localNotes" : "updates.notes")}><h3>{t(job.source?.kind === "local" ? "updates.localNotes" : "updates.notes")}</h3><pre>{job.notes || t("updates.noNotes")}</pre>
        {downloading && <><Progress label={t("updateDownloadProgress")} value={job.total ? (job.downloaded ?? 0) / job.total * 100 : 0} /><p role="status">{t("downloadingValueMb", { size: ((job.downloaded ?? 0) / 1048576).toFixed(1) })}</p></>}
        {job.state === "checking" && <p role="status">{t("checkingLabel")}</p>}
      </section>
      <section className="update-impact"><WorkGroups job={job} />
        <SingleChoice label={t("updates.timing")} value={timing} onChange={value => setSelection(value as UpdateTiming)} disabled={job.supported === false || s.requesting || !available() && !canSchedule} options={(["settled", "now", "defer"] as const).map(value => ({ value, label: t(`updates.when.${value}`) }))} />
        {job.supported === false && <p>{t("updates.pipelineUnsupported")}</p>}
        {timing === "now" && job.work.blocking.length > 0 && <p className="update-consequence">{t("updates.dropInteractions")}</p>}
        {job.when === "defer" && job.deferUntil && <time dateTime={job.deferUntil}>{t("updates.deferredUntil", { time: new Date(job.deferUntil).toLocaleTimeString() })}</time>}
      </section>
    </div>}
    {(s.error || job.error) && <Notice>{s.error || job.error}</Notice>}
    {s.message && <p role="status">{s.message}</p>}
    <footer className="update-panel-footer">
      {available() && <Button variant="ghost" disabled={s.requesting} onClick={skipUpdate}>{t("skipThisVersion")}</Button>}
      {canSchedule && <Button variant="ghost" disabled={s.requesting} onClick={() => action(scheduleUpdate("cancel"))}>{t(job.source?.kind === "local" ? "updates.cancelReplacement" : "cancel")}</Button>}
      {downloading && <Button disabled={s.requesting} onClick={() => action(cancelDownload())}>{t("cancelDownload")}</Button>}
      <span className="spacer" />
      {job.state === "idle" && <Button disabled={s.requesting} onClick={() => action(checkUpdate())}>{t("checkForUpdates")}</Button>}
      {(available() || canSchedule) && <Button variant="primary" busy={s.requesting} onClick={() => action(advancing ? scheduleUpdate("now") : primary())}>{t(advancing ? "updates.restartNow" : `updates.action.${timing}`)}</Button>}
    </footer>
  </>;
}
export function UpdateDock() {
  const s = updates.use();
  if (!updateVisible() && !s.panelOpen) return null;
  const settling = updateActive(s.snapshot);
  return <><span className="update-dock-divider" aria-hidden="true" /><Popover.Root modal={false} open={s.panelOpen} onOpenChange={open => open ? showUpdate() : dismissUpdate()}>
    <Popover.Trigger asChild><button type="button" className="update-dock-entry" data-hover-target="updates" aria-label={t("viewUpdate")}>
      <Icon icon={settling ? LoaderCircle : ArrowUp} size={20} className={settling ? "update-ring" : undefined} />{available() && <span className="update-available-dot" />}
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="update-panel" side="top" align="end" sideOffset={12} collisionPadding={16} aria-label={t("appUpdates")} onOpenAutoFocus={event => event.preventDefault()} onEscapeKeyDown={event => event.stopPropagation()}>
      <PanelContents key={s.snapshot.id ?? s.snapshot.source?.version ?? "offer"} />
    </Popover.Content></Popover.Portal>
  </Popover.Root></>;
}
export function UpdateOutcome() {
  const { outcome: job } = updates.use();
  if (!job) return null;
  const failedRestore = job.state === "failed" && job.backupMoved;
  const title = failedRestore ? "updates.restoreFailed" : job.state === "succeeded" && job.source?.kind === "local" ? "updates.localReplaced" : `updates.state.${job.state}`;
  return <aside className="update-outcome" role="status" aria-live="polite">
    <header><strong>{t(title)}</strong><IconButton icon={X} label={t("dismissMessage")} onClick={dismissOutcome} /></header>
    {job.error && <p>{job.error}</p>}
    {failedRestore && <code>{job.backup}</code>}
    <div className="actions">
      {job.state === "succeeded" && <><Button onClick={() => action(openReleaseNotes())}>{t("updates.notes")}</Button><Button onClick={() => { navigation.set(old => ({ ...old, page: "tasks" })); dismissOutcome(); }}>{t("updates.resumedTasks", { count: job.resumedCount ?? 0 })}</Button></>}
      {job.state === "rolled-back" && <><Button disabled={!job.logPath} onClick={() => job.logPath && action(reveal(job.logPath))}>{t("updates.viewLog")}</Button><Button onClick={() => { action(retryUpdate(job)); dismissOutcome(); }}>{t("retryReplacement")}</Button></>}
      {failedRestore && job.backup && <><Button onClick={() => action(reveal(job.backup!))}>{t("updates.showInFinder")}</Button><Button onClick={() => action(copyText(job.backup!))}>{t("updates.copyPath")}</Button></>}
      {job.state === "failed" && !failedRestore && <Button onClick={() => { action(retryUpdate(job)); dismissOutcome(); }}>{t("retryReplacement")}</Button>}
    </div>
  </aside>;
}
export function AppUpdate() {
  return <Group title={t("appUpdates")}><Row id="settings-updates-entry" title={t("appUpdates")} onNavigate={() => navigation.set(old => ({ ...old, settingsUpdates: true }))} /></Group>;
}
export function UpdatesSettings() {
  const s = updates.use(), { status } = connector.use();
  const automatic = updateAutomatic.use(), local = acceptLocal.use(), resume = resumeInterrupted.use(), scheduling = controlScheduling.use();
  const [notes, setNotes] = useState(false);
  return <div className="settings-page">
    <Group title={t("updates.currentVersion")}><Row title={`Agent Remote Control v${status?.version ?? "—"}`}>
      <Button onClick={() => action(openReleaseNotes())}>{t("updates.notes")}</Button><Button disabled={!isDesktop || s.requesting || updateActive(s.snapshot)} busy={s.snapshot.state === "checking"} onClick={() => action(checkUpdate())}>{t("checkForUpdates")}</Button>
    </Row>{updateActive(s.snapshot) && <Row title={t(`updates.state.${s.snapshot.state}`)}><Button onClick={() => { navigation.set(old => ({ ...old, page: "overview" })); showUpdate(); }}>{t("viewUpdate")}</Button></Row>}{available() && <Row title={t("newVersionValue", { version: s.snapshot.source?.version })}><Button onClick={() => setNotes(!notes)}>{t("updates.notes")}</Button><Button onClick={() => action(installUpdate())}>{t("updates.action.settled")}</Button></Row>}{notes && <pre className="release-notes">{s.snapshot.notes}</pre>}
      {s.error && <Notice>{s.error}</Notice>}{s.message && <p role="status">{s.message}</p>}
    </Group>
    <Group title={t("updates.sources")}><Row title={t("updates.releaseChannel")}><SingleChoice value="stable" label={t("updates.releaseChannel")} onChange={() => {}} options={[{ value: "stable", label: t("updates.stable") }]} /></Row>
      <Row title={t("updates.acceptLocal")}><Switch label={t("updates.acceptLocal")} checked={local === "on"} onChange={value => acceptLocal.set(value ? "on" : "off")} /></Row></Group>
    <Group title={t("updates.timing")}><Row title={t("updates.installTiming")}><SingleChoice value={automatic} label={t("updates.installTiming")} onChange={updateAutomatic.set} options={[{ value: "automatic", label: t("updates.automatic") }, { value: "ask", label: t("updates.ask") }]} /></Row>
      <Row title={t("updates.resumeInterrupted")}><Switch label={t("updates.resumeInterrupted")} checked={resume === "on"} onChange={value => resumeInterrupted.set(value ? "on" : "off")} /></Row>
      <Row title={t("updates.controlScheduling")}><Switch label={t("updates.controlScheduling")} checked={scheduling === "on"} onChange={value => controlScheduling.set(value ? "on" : "off")} /></Row></Group>
    <Group title={t("updates.recent")}>
      {!s.snapshot.recent?.length && <p>{t("updates.noHistory")}</p>}
      {s.snapshot.recent?.map(job => <Row key={job.id} title={<span className="update-history-title"><Identity job={job} /><span>{job.instance} · {t(`updates.state.${job.state}`)}</span></span>}>
        {job.backupReady && job.backup && <Button disabled={s.requesting || updateActive(s.snapshot)} onClick={() => action(submitLocal(job.backup!))}>{t("updates.restore")}</Button>}
      </Row>)}
    </Group>
  </div>;
}
