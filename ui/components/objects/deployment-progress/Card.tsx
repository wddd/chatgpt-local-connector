import { DeploymentProgressChip } from "./Chip";
import { Sensitive } from "../../Sensitive";
import "./deployment-progress.css";
import { usePrivacy } from "../../../state/privacy";
import { maskSensitive } from "../../../privacyMask";
import { Check, Circle } from "lucide-react";
import { t } from "../../../i18n";
import Address from "../../Address";
import type { RelayProgress as Progress } from "../../../state/relay";
import { ActionGroup, Button, EntityCard, Icon, Loading, Notice, SingleChoice } from "../../ui";
export function DeploymentProgressCard({ progress, busy, account, setAccount, onCancel, onRetry }: {
  progress: Progress; busy: boolean; account: string; setAccount: (value: string) => void; onCancel: () => void; onRetry: () => void;
}) {
  const hidden = usePrivacy();
  const accountOptions = progress.accounts ?? [];
  const phase = ["login", "deploying", "connecting", "ready"].indexOf(progress.phase);
  const reason = progress.reason ?? "";
  const failure = progress.cancelled ? "cancelled" : progress.accounts?.length ? "chooseAccount"
    : /timed out/i.test(reason) ? "timeout"
    : /invalid.*link|invalid.*origin|shared.*token|invitation/i.test(reason) ? "invalidLink"
    : /account.*unavailable|no cloudflare account/i.test(reason) ? "accountUnavailable"
    : `failure.${progress.failedPhase ?? "connecting"}`;
  return <EntityCard className="remote-progress" title={<DeploymentProgressChip progress={progress} />}>
    {progress.cancelled || progress.phase === "failed" ? <>
      <Notice tone={progress.cancelled ? "warning" : "danger"}>{t(`connect.${failure}`)}</Notice>
      {!!progress.accounts?.length && <SingleChoice disabled={busy} label={t("connect.chooseAccount")} value={String(accountOptions.findIndex(option => option.id === account))} onChange={value => setAccount(accountOptions[Number(value)].id)} options={accountOptions.map((a, index) => ({ value: String(index), label: hidden ? maskSensitive(a.name || a.id, true) : a.name || a.id }))} />}
      <Button variant="primary" busy={busy} disabled={!!progress.accounts?.length && !accountOptions.some(option => option.id === account)} onClick={onRetry}>{t("retry")}</Button>
    </> : <ol className="remote-steps">{["login", "deploying", "connecting"].map((step, index) => <li key={step} aria-current={index === phase ? "step" : undefined}>
      <Icon icon={phase > index ? Check : Circle} /><div><strong>{t(`connect.phase.${step}`)}</strong>{phase === index && <Loading label={t("connect.inProgress")} />}</div>
    </li>)}</ol>}
    {progress.loginUrl && <Address value={progress.loginUrl} label={t("connect.copyLogin")} disabled={busy} />}
    {progress.phase === 'ready' && progress.result?.url && <Sensitive wrap>{progress.result.url}</Sensitive>}
    {progress.phase !== 'ready' && <ActionGroup><Button disabled={busy} onClick={onCancel}>{t("cancel")}</Button></ActionGroup>}
  </EntityCard>;
}
