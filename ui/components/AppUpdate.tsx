import { ExternalLink } from "lucide-react";
import { t } from "../i18n";
import { isDesktop, openUrl } from "../platform";
import { connector, notify } from "../state/connector";
import {
  updates,
  available,
  updateVisible,
  checkUpdate,
  showUpdate,
  dismissUpdate,
  installUpdate,
  cancelUpdate,
  skipUpdate,
  openDownloads,
  dismissReplacement,
  retryReplacement,
} from "../state/updates";
import {
  Button,
  Dialog,
  Group,
  Row,
  Notice,
  Progress,
  Icon,
  Tooltip,
} from "./ui";
import { replacementActive, replacementFailed } from "../state/updateModel";
import { displayMessage } from "../messages";
export function AppUpdate() {
  const { status } = connector.use(),
    state = updates.use(),
    checking = state.checking,
    active = state.phase !== "idle" || state.requesting,
    feedback = !state.dialogOpen && (state.error || state.message),
    label = checking
      ? t("checkingLabel")
      : state.phase === "downloading"
        ? t("downloadingValueMb", {size: (state.downloaded / 1048576).toFixed(1)})
      : feedback
        ? state.error ? t("updateCheckRetry") : displayMessage(state.message)
        : t("checkForUpdates");
  return (
    <Group title={t("aboutApp")}>
      <Row title={`Agent Remote Control v${status?.version ?? "—"}`}>
        <Tooltip text={feedback ? displayMessage(feedback) : label}>
          <Button
            className="update-check"
            aria-busy={checking}
            disabled={!isDesktop || active || checking || replacementActive(state.replacement)}
            onClick={() => void checkUpdate()}
          >
            <span className="update-check-size" aria-hidden="true">
              {t("checkForUpdates")}
            </span>
            <span className="update-check-size" aria-hidden="true">
              {t("youAreUpToDate")}
            </span>
            <span className="update-check-size" aria-hidden="true">
              {t("updateCheckRetry")}
            </span>
            <span className="update-check-label" aria-live="polite">{label}</span>
          </Button>
        </Tooltip>
      </Row>
      {updateVisible() && (
        <Row title={t("newVersionValue", { version: state.update?.version })}>
          <Button onClick={showUpdate}>{t("viewUpdate")}</Button>
        </Row>
      )}
      {replacementActive(state.replacement) && <Row title={t("replacementInProgress", {version: state.replacement?.package?.version ?? ""})}>
        <span role="status">{t(state.replacement?.state === "verifying" ? "replacementValidating" : state.replacement?.state === "installing" ? "replacementInstalling" : state.replacement?.state === "starting" ? "replacementStarting" : state.replacement?.state === "rolling-back" ? "replacementRestoring" : "replacementWaiting")}</span>
      </Row>}
      {replacementFailed(state.replacement) && <Row title={t("replacementUnfinished")}>
        <Button onClick={() => updates.set(old => ({...old, replacementOpen: true}))}>{t("viewDetails")}</Button>
      </Row>}
      <Row title="whzxc/agent-remote-control">
        <Button
          variant="ghost"
          onClick={() =>
            void openUrl(
              "https://github.com/whzxc/agent-remote-control",
            ).catch((e) => notify(String(e), true))
          }
        >
          GitHub <Icon icon={ExternalLink} />
        </Button>
      </Row>
    </Group>
  );
}
export function AppUpdateDialogs() {
  const s = updates.use(),
    active = s.phase !== "idle" || s.requesting,
    downloading = s.phase === "downloading",
    progress = s.total ? Math.max(0, Math.min(100, s.downloaded / s.total * 100)) : 0;
  const actionLabel = s.phase === "installing"
    ? t("installingRestartingSoon")
    : downloading
      ? s.total
        ? t("updateDownloadSizeProgress", {
            size: (s.downloaded / 1048576).toFixed(1),
            total: (s.total / 1048576).toFixed(1),
            percent: Math.floor(progress),
          })
        : t("downloadingValueMb", { size: (s.downloaded / 1048576).toFixed(1) })
      : t(s.update?.ready ? "updateDownloadedInstall" : "downloadUpdate");
  return (
    <>
      <Dialog open={s.replacementOpen} onClose={dismissReplacement} title={t(s.replacement?.state === "rolled-back" ? "replacementRolledBack" : s.replacement?.state === "cancelled" ? "replacementCancelled" : "replacementFailed")} busy={s.requesting} footer={<>
        <Button onClick={dismissReplacement} disabled={s.requesting}>{t("close")}</Button>
        {s.replacement?.source && !s.replacement.backupMoved && <Button variant="primary" disabled={active || s.checking} onClick={() => void retryReplacement()}>{t("retryReplacement")}</Button>}
      </>}>
        <p>{t(s.replacement?.state === "rolled-back" ? "replacementPreviousRestored" : s.replacement?.state === "cancelled" ? "replacementNotInstalled" : "replacementIncomplete", {version: s.replacement?.package?.version ?? ""})}</p>
        {s.replacement?.backupMoved && <><p>{t("replacementBackupPreserved")}</p><pre className="release-notes">{s.replacement.backup}</pre></>}
        {s.replacement?.error && <Notice>{displayMessage(s.replacement.error)}</Notice>}
        {s.replacementError && <Notice>{displayMessage(s.replacementError)}</Notice>}
      </Dialog>
      <Dialog
        open={s.dialogOpen}
        onClose={dismissUpdate}
        title={
          available()
            ? t("versionValueIsAvailable", { version: s.update?.version })
            : t("appUpdates")
        }
        busy={active}
        footer={
          <>
            {available() && !active && (
              <Button variant="ghost" onClick={skipUpdate}>
                {t("skipThisVersion")}
              </Button>
            )}
            <span className="spacer" />
            {!active && <Button onClick={dismissUpdate}>{t("later")}</Button>}
            {!active && !s.checking && s.error && !available() && <Button variant="primary" onClick={() => void checkUpdate()}>{t("updateCheckRetry")}</Button>}
            {s.phase === "downloading" && (
              <Button onClick={() => void cancelUpdate()}>
                {t("cancelDownload")}
              </Button>
            )}
            {available() && (
              <Button
                variant="primary"
                className="update-action"
                data-phase={s.phase}
                busy={s.phase === "installing"}
                aria-busy={active}
                disabled={active || s.checking || replacementActive(s.replacement)}
                onClick={() => void installUpdate()}
              >
                {downloading && <Progress label={t("updateDownloadProgress")} value={progress} color="var(--on-action)" />}
                <span className="update-action-label" aria-live="polite">{actionLabel}</span>
              </Button>
            )}
          </>
        }
      >
        {s.checking && <p role="status">{t("checkingLabel")}</p>}
        {available() && (
          <>
            <p className="muted">
              {t("installationRestartsTheAppAndRestoresThePrevious")}
            </p>
            <pre className="release-notes">
              {s.update?.notes || t("aNewVersionIsReadyToDownloadAnd")}
            </pre>
          </>
        )}
        {s.error && (
          <Notice
            action={
              <Button onClick={() => void openDownloads()}>
                {t("downloadManually")} <Icon icon={ExternalLink} />
              </Button>
            }
          >
            {displayMessage(s.error)}
          </Notice>
        )}
        {s.message && <p role="status">{displayMessage(s.message)}</p>}
      </Dialog>
      <Dialog
        open={!!s.announcement}
        onClose={() =>
          updates.set((old) => ({ ...old, announcement: undefined }))
        }
        title={t("updatedToVersion", { version: s.announcement?.version })}
      >
        <pre className="release-notes">
          {s.announcement?.notes || t("updateCompleted")}
        </pre>
      </Dialog>
    </>
  );
}
