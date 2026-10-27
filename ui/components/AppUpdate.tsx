import { ActionGroup, SectionHeader, Button, SettingsSection, SettingRow, Notice, Progress, Icon, IconButton, ChoiceControl, Switch } from "./ui";
import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Separator } from "./ui/separator";
import { Card } from "./ui/card";
import { ArrowUp, Check, LoaderCircle, X } from "lucide-react";
import { t } from "../i18n";
import { copyText, isDesktop } from "../platform";
import { connector, notify } from "../state/connector";
import { navigation } from "../state/navigation";
import { agentActivity } from "../state/activity";
import { useInterval } from "../state/hooks";
import { updates, available, updateVisible, checkUpdate, showUpdate, dismissUpdate, installUpdate, scheduleUpdate, skipUpdate, cancelDownload, dismissOutcome, retryUpdate, submitLocal, openReleaseNotes, updateAutomatic, acceptLocal, resumeInterrupted, controlScheduling } from "../state/updates";
import { updateActive, updateCountdown, updateStep, type UpdateSnapshot, type UpdateTiming, type UpdateWork } from "../state/updateModel";
import { LiveInteractionRequestCard } from "./objects/interaction-request";
import { TaskRow } from "./objects/task";
import { useAppNow } from "../state/appEnvironment";
import { selectAgentPanel } from "../state/overviewPanels";

const action = (promise: Promise<unknown>) => void promise.catch(error => notify(String(error), true));
async function reveal(path: string) {
  if (isDesktop) { const { revealItemInDir } = await import("@tauri-apps/plugin-opener"); await revealItemInDir(path); }
}
function Identity({ job }: { job: UpdateSnapshot }) {
  return <><strong className="font-semibold">{t(job.source?.kind === "local" ? "updates.localVersion" : "updates.releaseVersion", { version: job.source?.version ?? "—" })}</strong>
    {job.source?.kind === "local" && job.source.build && <code className="text-xs text-muted-foreground">{job.source.branch ? `${job.source.branch} @ ` : ""}{job.source.build.slice(0, 8)}</code>}
    {!!job.source?.landedLanes?.length && <span className="text-xs text-muted-foreground">{job.source.landedLanes.join(", ")}</span>}</>;
}
function WorkItem({ item, answerable }: { item: UpdateWork; answerable: boolean }) {
  const activity = agentActivity.use().snapshot;
  const now = useAppNow(1000);
  const session = item.agent ? activity?.agents[item.agent]?.sessions.find(session => session.id === item.taskId) : undefined;
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  return <li>
    {session && item.agent ? <TaskRow kind="activity" agent={item.agent} session={{ ...session, orderAt: Date.parse(session.startedAt ?? '') || 0 }} live now={now}
      onOpen={() => { dismissUpdate(); selectAgentPanel({ type: 'task', agent: item.agent!, session: { ...session, orderAt: Date.parse(session.startedAt ?? '') || 0 } }); }} /> : <div className="flex justify-between gap-2 text-sm wrap-anywhere"><span>{item.title || session?.title || item.taskId || t(`updates.work.${item.kind}`)}</span>{item.count !== undefined && <span>{item.count}</span>}</div>}
    {answerable && session?.interaction && <LiveInteractionRequestCard key={JSON.stringify(session.interaction.respond)} agent={item.agent!} session={session} answers={answers} onAnswersChange={setAnswers} />}

  </li>;
}
function WorkGroups({ job }: { job: UpdateSnapshot }) {
  return <>{(["blocking", "willResume", "unaffected", "stale"] as const).map(group => {
    const items = job.work[group] ?? [];
    if (group === "stale" && !items.length) return null;
    return <section key={group} className="grid gap-3" aria-label={t(`updates.${group}`)}>
      <h3 className="flex justify-between text-sm">{t(`updates.${group}`)} <span className="font-normal text-muted-foreground">{items.length}</span></h3>
      {!!items.length && <ul className="m-0 list-none space-y-3 p-0">{items.map((item, index) => <WorkItem key={`${item.agent}:${item.taskId}:${index}`} item={item} answerable={group === "blocking"} />)}</ul>}
    </section>;
  })}</>;
}
function Steps({ job }: { job: UpdateSnapshot }) {
  const step = updateStep(job);
  return <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-6" aria-label={t("updates.progress")}>
    {["verify", "backup", "settle", "restart", "health", "resume"].map((name, index) => <li className="text-center text-xs text-muted-foreground data-[complete]:text-brand-accent aria-[current=step]:text-brand-accent aria-[current=step]:[&>span]:outline aria-[current=step]:[&>span]:outline-ring" key={name} data-complete={index < step || undefined} aria-current={index === step ? "step" : undefined}>
      <span className="mx-auto mb-2 grid size-7 place-items-center rounded-full bg-muted">{index < step ? <Icon icon={Check} /> : index + 1}</span>{t(`updates.step.${name}`)}
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
    <SectionHeader className="update-panel-header shrink-0 border-b p-3 sm:px-5 sm:py-4" level={3} title={<span className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 wrap-anywhere"><Identity job={job} /></span>} actions={<><IconButton icon={X} label={t("close")} onClick={dismissUpdate} /></>} />
    <div className="update-panel-body flex min-h-0 flex-col overflow-y-auto">
    {advancing ? <div className="px-5 py-7" role="status" aria-live="polite">
      <h2 className="mb-7 text-center text-lg">{seconds === undefined ? t(`updates.state.${job.state}`) : t("replacementCountdown", { seconds })}</h2>
      <Steps job={job} />
    </div> : <div className="update-columns grid min-h-0 max-h-115 grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1">
      <section className="update-notes min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 sm:p-5" tabIndex={0} aria-label={t(job.source?.kind === "local" ? "updates.localNotes" : "updates.notes")}><h3 className="mb-3 text-sm">{t(job.source?.kind === "local" ? "updates.localNotes" : "updates.notes")}</h3><pre className="m-0 font-sans leading-relaxed whitespace-pre-wrap wrap-anywhere">{job.notes || t("updates.noNotes")}</pre>
        {downloading && <><Progress label={t("updateDownloadProgress")} value={job.total ? (job.downloaded ?? 0) / job.total * 100 : 0} /><p role="status">{t("downloadingValueMb", { size: ((job.downloaded ?? 0) / 1048576).toFixed(1) })}</p></>}
        {job.state === "checking" && <p role="status">{t("checkingLabel")}</p>}
      </section>
      <section className="update-impact flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain border-t p-4 sm:border-t-0 sm:border-l sm:p-5" tabIndex={0}><WorkGroups job={job} />
        <ChoiceControl label={t("updates.timing")} value={timing} onChange={value => setSelection(value as UpdateTiming)} disabled={job.supported === false || s.requesting || !available() && !canSchedule} options={(["settled", "now", "defer"] as const).map(value => ({ value, label: t(`updates.when.${value}`) }))} />
        {job.supported === false && <p>{t("updates.pipelineUnsupported")}</p>}
        {timing === "now" && job.work.blocking.length > 0 && <p className="text-xs text-warning">{t("updates.dropInteractions")}</p>}
        {job.when === "defer" && job.deferUntil && <time dateTime={job.deferUntil}>{t("updates.deferredUntil", { time: new Date(job.deferUntil).toLocaleTimeString() })}</time>}
      </section>
    </div>}
    {(s.error || job.error) && <div className="mx-5 my-3 shrink-0"><Notice>{s.error || job.error}</Notice></div>}
    {s.message && <p className="mx-5 my-3 shrink-0" role="status">{s.message}</p>}
    </div>
    <footer className="update-panel-footer flex shrink-0 flex-wrap items-center gap-2 border-t p-3 sm:gap-3 sm:px-5 sm:py-4">
      {available() && <Button variant="ghost" disabled={s.requesting} onClick={skipUpdate}>{t("skipThisVersion")}</Button>}
      {canSchedule && <Button variant="ghost" disabled={s.requesting} onClick={() => action(scheduleUpdate("cancel"))}>{t(job.source?.kind === "local" ? "updates.cancelReplacement" : "cancel")}</Button>}
      {downloading && <Button disabled={s.requesting} onClick={() => action(cancelDownload())}>{t("cancelDownload")}</Button>}
      <span className="flex-1" />
      {job.state === "idle" && <Button disabled={s.requesting} onClick={() => action(checkUpdate())}>{t("checkForUpdates")}</Button>}
      {(available() || canSchedule) && <Button variant="primary" busy={s.requesting} onClick={() => action(advancing ? scheduleUpdate("now") : primary())}>{t(advancing ? "updates.restartNow" : `updates.action.${timing}`)}</Button>}
    </footer>
  </>;
}
export function UpdateDock() {
  const s = updates.use();
  if (!updateVisible() && !s.panelOpen) return null;
  const settling = updateActive(s.snapshot);
  return <><Separator orientation="vertical" className="mx-1 shrink-0 data-[orientation=vertical]:h-5.5" /><Popover modal={false} open={s.panelOpen} onOpenChange={open => open ? showUpdate() : dismissUpdate()}>
    <PopoverTrigger asChild><Button variant="surface" type="button" className="update-dock-entry relative shrink-0 text-brand-accent" data-hover-target="updates" aria-label={t("viewUpdate")}>
      <Icon icon={settling ? LoaderCircle : ArrowUp} size={20} className={settling ? "animate-spin motion-reduce:animate-none" : undefined} />{available() && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand-accent" />}
    </Button></PopoverTrigger>
    <PopoverContent className="update-panel z-70 flex w-180 flex-col overflow-hidden rounded-xl p-0 duration-150 motion-reduce:animate-none" side="top" align="end" sideOffset={12} collisionPadding={16} aria-label={t("appUpdates")} onOpenAutoFocus={event => event.preventDefault()} onEscapeKeyDown={event => event.stopPropagation()}>
      <PanelContents key={s.snapshot.id ?? s.snapshot.source?.version ?? "offer"} />
    </PopoverContent>
  </Popover></>;
}
export function UpdateOutcome() {
  const { outcome: job } = updates.use();
  if (!job) return null;
  const failedRestore = job.state === "failed" && job.backupMoved;
  const title = failedRestore ? "updates.restoreFailed" : job.state === "succeeded" && job.source?.kind === "local" ? "updates.localReplaced" : `updates.state.${job.state}`;
  return <Card asChild className="fixed right-4 bottom-4 left-4 z-80 grid sm:left-auto sm:w-104 gap-3 rounded-xl p-4 shadow-overlay animate-in fade-in-0 duration-150 motion-reduce:animate-none"><aside className="update-outcome" role="status" aria-live="polite">
    <SectionHeader  level={3} title={<>{t(title)}</>} actions={<><IconButton icon={X} label={t("dismissMessage")} onClick={dismissOutcome} /></>} />
    {job.error && <p className="text-sm wrap-anywhere">{job.error}</p>}
    {failedRestore && <code className="text-sm wrap-anywhere">{job.backup}</code>}
    <ActionGroup align="leading">
      {job.state === "succeeded" && <><Button onClick={() => action(openReleaseNotes())}>{t("updates.notes")}</Button><Button onClick={() => { navigation.set(old => ({ ...old, page: "tasks" })); dismissOutcome(); }}>{t("updates.resumedTasks", { count: job.resumedCount ?? 0 })}</Button></>}
      {job.state === "rolled-back" && <><Button disabled={!job.logPath} onClick={() => job.logPath && action(reveal(job.logPath))}>{t("updates.viewLog")}</Button><Button onClick={() => { action(retryUpdate(job)); dismissOutcome(); }}>{t("retryReplacement")}</Button></>}
      {failedRestore && job.backup && <><Button onClick={() => action(reveal(job.backup!))}>{t("updates.showInFinder")}</Button><Button onClick={() => action(copyText(job.backup!))}>{t("updates.copyPath")}</Button></>}
      {job.state === "failed" && !failedRestore && <Button onClick={() => { action(retryUpdate(job)); dismissOutcome(); }}>{t("retryReplacement")}</Button>}
    </ActionGroup>
  </aside></Card>;
}
export function AppUpdate() {
  const { status } = connector.use();
  return <SettingsSection title={t("appUpdates")}><SettingRow id="settings-updates-entry" label={t("updates.currentVersion")} description={`Agent Remote Control v${status?.version ?? "—"}`} onNavigate={() => navigation.set(old => ({ ...old, settingsUpdates: true }))} /></SettingsSection>;
}
export function UpdatesSettings() {
  const s = updates.use(), { status } = connector.use();
  const automatic = updateAutomatic.use(), local = acceptLocal.use(), resume = resumeInterrupted.use(), scheduling = controlScheduling.use();
  const [notes, setNotes] = useState(false);
  return <div className="settings-page mx-auto w-full min-w-0 max-w-3xl">
    <SettingsSection title={t("updates.currentVersion")}><SettingRow label={`Agent Remote Control v${status?.version ?? "—"}`}>
      <ActionGroup><Button onClick={() => action(openReleaseNotes())}>{t("updates.notes")}</Button><Button disabled={!isDesktop || s.requesting || updateActive(s.snapshot)} busy={s.snapshot.state === "checking"} onClick={() => action(checkUpdate())}>{t("checkForUpdates")}</Button></ActionGroup>
    </SettingRow>{updateActive(s.snapshot) && <SettingRow label={t(`updates.state.${s.snapshot.state}`)}><Button onClick={() => { navigation.set(old => ({ ...old, page: "overview" })); showUpdate(); }}>{t("viewUpdate")}</Button></SettingRow>}{available() && <SettingRow label={t("newVersionValue", { version: s.snapshot.source?.version })}><ActionGroup><Button onClick={() => setNotes(!notes)}>{t("updates.notes")}</Button><Button onClick={() => action(installUpdate())}>{t("updates.action.settled")}</Button></ActionGroup></SettingRow>}{notes && <pre className="my-4 font-sans text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{s.snapshot.notes}</pre>}
      {s.error && <Notice>{s.error}</Notice>}{s.message && <p role="status">{s.message}</p>}
    </SettingsSection>
    <SettingsSection title={t("updates.sources")}><SettingRow label={t("updates.releaseChannel")}><ChoiceControl value="stable" label={t("updates.releaseChannel")} onChange={() => {}} options={[{ value: "stable", label: t("updates.stable") }]} /></SettingRow>
      <SettingRow label={t("updates.acceptLocal")}><Switch label={t("updates.acceptLocal")} checked={local === "on"} onChange={value => acceptLocal.set(value ? "on" : "off")} /></SettingRow></SettingsSection>
    <SettingsSection title={t("updates.timing")}><SettingRow label={t("updates.installTiming")}><ChoiceControl value={automatic} label={t("updates.installTiming")} onChange={updateAutomatic.set} options={[{ value: "automatic", label: t("updates.automatic") }, { value: "ask", label: t("updates.ask") }]} /></SettingRow>
      <SettingRow label={t("updates.resumeInterrupted")}><Switch label={t("updates.resumeInterrupted")} checked={resume === "on"} onChange={value => resumeInterrupted.set(value ? "on" : "off")} /></SettingRow>
      <SettingRow label={t("updates.controlScheduling")}><Switch label={t("updates.controlScheduling")} checked={scheduling === "on"} onChange={value => controlScheduling.set(value ? "on" : "off")} /></SettingRow></SettingsSection>
    <SettingsSection title={t("updates.recent")}>
      {!s.snapshot.recent?.length && <p>{t("updates.noHistory")}</p>}
      {s.snapshot.recent?.map(job => <SettingRow key={job.id} label={<span className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 wrap-anywhere"><Identity job={job} /><span>{job.instance} · {t(`updates.state.${job.state}`)}</span></span>}>
        {job.backupReady && job.backup && <Button disabled={s.requesting || updateActive(s.snapshot)} onClick={() => action(submitLocal(job.backup!))}>{t("updates.restore")}</Button>}
      </SettingRow>)}
    </SettingsSection>
  </div>;
}
