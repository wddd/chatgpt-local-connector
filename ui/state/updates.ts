import { api } from "../api";
import { createStore, preference, preferenceStorage } from "./store";
import { t } from "../i18n";
import { isDesktop, openUrl } from "../platform";
import { mergeUpdateSnapshot, mergeReplacement, replacementActive, replacementFailed, replacementForApp, type Update, type UpdateSnapshot, type Replacement } from "./updateModel";
export type { Update } from "./updateModel";
export const skipped = preference("update-skipped-version", "", value => value, value => value);
const replacementSeen = preference("replacement-notice-id", "", value => value, value => value);
export const updates = createStore<{
  update?: Update;
  checking: boolean;
  requesting: boolean;
  phase: "idle" | "downloading" | "installing";
  downloaded: number;
  total?: number;
  error: string;
  message: string;
  dialogOpen: boolean;
  announcement?: Update;
  replacement?: Replacement;
  replacementOpen: boolean;
  replacementError: string;
}>({ checking: false, requesting: false, phase: "idle", downloaded: 0, error: "", message: "", dialogOpen: false, replacementOpen: false, replacementError: "" });
const patch = (next: Partial<ReturnType<typeof updates.get>>) => updates.set(old => ({ ...old, ...next }));
export const available = () => !!updates.get().update?.available && updates.get().update?.version !== skipped.get();
export const updateVisible = () => available() && !!updates.get().update?.ready;
let dismissedVersion = "", directRequested = false, manualCheck = false;
let snapshot: UpdateSnapshot | undefined;
let pending: Promise<void> | undefined;
let reading: Promise<void> | undefined;
export function acceptUpdateSnapshot(next: UpdateSnapshot) {
  const merged = mergeUpdateSnapshot(snapshot, next);
  if (merged === snapshot) return;
  snapshot = merged;
  const cancelled = merged.error === "UPDATE_CANCELLED";
  patch({
    update: merged.update ?? undefined,
    checking: merged.phase === "checking",
    phase: merged.phase === "downloading" || merged.phase === "installing" ? merged.phase : "idle",
    downloaded: merged.downloaded ?? 0,
    total: merged.total ?? undefined,
    error: merged.error && !cancelled ? t(merged.errorStage === "check" ? "updateCheckFailedValueRetryOrVisitThe" : merged.errorStage === "install" ? "updateInstallFailedValue" : "updateDownloadFailedValue", { error: merged.error }) : "",
    message: cancelled ? t("downloadCancelledTheCurrentConnectionIsUnchanged") : "",
  });
  if (available() && (manualCheck || updateVisible()) && updates.get().update?.version !== dismissedVersion) showUpdate();
}
const read = () => reading ??= api<UpdateSnapshot>("updates").then(acceptUpdateSnapshot).finally(() => { reading = undefined; });
export function showUpdate() { patch({ dialogOpen: true }); }
export function dismissUpdate() {
  if (updates.get().phase !== "idle" || updates.get().requesting) return;
  dismissedVersion = updates.get().update?.version || "";
  patch({ dialogOpen: false });
  directRequested = false;
}
function request(operation: "check" | "download" | "install", manual = true) {
  if (!isDesktop) return Promise.resolve();
  if (pending) return pending;
  if (updates.get().requesting || updates.get().phase !== "idle" || updates.get().checking) return Promise.resolve();
  const version = updates.get().update?.version;
  if (operation !== "check" && !version) return Promise.resolve();
  const revision = snapshot?.revision ?? -1;
  manualCheck = operation === "check" && manual;
  patch({ requesting: true, error: "", message: "", ...(operation === "check" ? { checking: true, update: undefined } : {}) });
  pending = (async () => {
    let failure: unknown;
    try {
      if (operation === "install" && directRequested)
        preferenceStorage.setItem("update-announcement", JSON.stringify(updates.get().update));
      const result = await api<Update>(`updates/${operation}`, "POST", operation === "check" ? undefined : { version });
      if (result.restarting) { patch({ phase: "installing" }); return; }
    } catch (error) { failure = error; }
    finally {
      // Command results never overwrite newer event/poll snapshots. Flush an older
      // in-flight read, then fetch the settled owner state after this command.
      // A failed poll is not a failed check/download. Events and the next poll
      // will reconcile the owner; preserve only errors from the command itself.
      try { await reading; } catch {}
      try { await read(); } catch {}
      if (failure && (snapshot?.revision ?? -1) <= revision && updates.get().phase === "idle")
        patch({ error: t(operation === "check" ? "updateCheckFailedValueRetryOrVisitThe" : operation === "install" ? "updateInstallFailedValue" : "updateDownloadFailedValue", { error: String(failure) }) });
      if (operation === "install" && updates.get().phase !== "installing") preferenceStorage.removeItem("update-announcement");
      patch({ requesting: false, checking: snapshot?.phase === "checking" });
      pending = undefined;
      manualCheck = false;
    }
    if (operation === "check" && manual) {
      if (snapshot && snapshot.revision > revision && !updates.get().error && updates.get().phase === "idle" && !updates.get().update?.available) patch({ message: t("youAreUpToDate") });
      if (updateVisible()) showUpdate();
    }
    if (failure && directRequested) showUpdate();
  })();
  return pending;
}
export function checkUpdate(manual = true) {
  if (manual) skipped.set("");
  if (manual && available() && updates.get().phase === "downloading") showUpdate();
  return request("check", manual);
}
export const installUpdate = () => request(updates.get().update?.ready ? "install" : "download");
export const installDirect = () => { directRequested = true; return request("install"); };
export async function cancelUpdate() {
  try { await api("updates/cancel", "POST"); } catch (error) { patch({ error: String(error) }); }
}
export function skipUpdate() {
  if (updates.get().phase !== "idle" || updates.get().requesting) return;
  skipped.set(updates.get().update?.version || "");
  dismissUpdate();
}
export async function openDownloads() {
  try { await openUrl("https://github.com/whzxc/agent-remote-control/releases/latest"); }
  catch (error) { patch({ error: t("unableToOpenDownloadsValue", { error: String(error) }) }); }
}
let dismissedReplacement = "";
export function dismissReplacement() {
  const current = updates.get().replacement;
  if (replacementActive(current)) dismissedReplacement = current?.id ?? "";
  else replacementSeen.set(`${current?.id}:${current?.state}`);
  patch({ replacementOpen: false });
}
let desktopBuild: Promise<string> | undefined;
async function readReplacement() {
  const result = await api<Replacement>("app/replace/status");
  const replacement = result.state === "cancelled"
    ? replacementForApp(result, await (desktopBuild ??= api<{build:string}>("app").then(value => value.build).catch(error => {desktopBuild = undefined; throw error;})))
    : result;
  const accepted = mergeReplacement(updates.get().replacement, replacement);
  patch({ replacement: accepted });
  if (replacementActive(accepted) && accepted.id !== dismissedReplacement
    || (replacementFailed(accepted) || accepted.state === "succeeded") && `${accepted.id}:${accepted.state}` !== replacementSeen.get()) patch({ replacementOpen: true });
}
export async function retryReplacement() {
  const source = updates.get().replacement?.source;
  if (!source || updates.get().requesting || updates.get().checking || updates.get().phase !== "idle") return;
  patch({ requesting: true, replacementError: "" });
  try {
    const receipt = await api<Replacement>("app/replace", "POST", { path: source, immediate: updates.get().replacement?.immediate === true });
    patch({ replacement: mergeReplacement(updates.get().replacement, receipt) });
    await api("app/replace/ack", "POST", { id: receipt.id });
    patch({ replacementOpen: false });
  } catch (error) { patch({ replacementError: String(error) }); }
  finally { patch({ requesting: false }); }
}
export function startUpdateChecks() {
  if (!isDesktop) return () => {};
  let disposed = false, off: (() => void) | undefined;
  void import("@tauri-apps/api/event").then(async ({ listen }) => {
    const stop = await listen<UpdateSnapshot>("update-progress", event => { if (!disposed) acceptUpdateSnapshot(event.payload); });
    if (disposed) stop(); else off = stop;
  }).catch(() => {});
  void (async () => {
    try {
      const saved = preferenceStorage.getItem("update-announcement");
      if (!saved) return;
      const next = JSON.parse(saved) as Update;
      const { getVersion } = await import("@tauri-apps/api/app");
      if (!disposed && next.version === await getVersion()) patch({ announcement: next });
      preferenceStorage.removeItem("update-announcement");
    } catch { preferenceStorage.removeItem("update-announcement"); }
  })();
  const refresh = () => { void read().catch(() => {}); void readReplacement().catch(() => {}); };
  refresh();
  const timer = setInterval(refresh, 2000);
  return () => { disposed = true; off?.(); clearInterval(timer); };
}
