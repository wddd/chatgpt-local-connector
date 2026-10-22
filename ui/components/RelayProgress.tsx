import { Check, Circle } from "lucide-react";
import { t } from "../i18n";
import { copyText } from "../platform";
import type { RelayProgress as Progress } from "../state/relay";
import { Button, Icon, Loading, Notice, SingleChoice } from "./ui";
export default function RelayProgress({ progress, busy, account, setAccount, onCancel, onRetry }: {
  progress: Progress; busy: boolean; account: string; setAccount: (value: string) => void; onCancel: () => void; onRetry: () => void;
}) {
  const phase = ["login", "deploying", "connecting", "ready"].indexOf(progress.phase);
  const reason = progress.reason ?? "";
  const failure = progress.cancelled ? "cancelled" : progress.accounts?.length ? "chooseAccount"
    : /timed out/i.test(reason) ? "timeout"
    : /invalid.*link|invalid.*origin|shared.*token|invitation/i.test(reason) ? "invalidLink"
    : /account.*unavailable|no cloudflare account/i.test(reason) ? "accountUnavailable"
    : `failure.${progress.failedPhase ?? "connecting"}`;
  return <div className="remote-progress">
    {progress.phase === "failed" ? <>
      <Notice tone="danger">{t(`connect.${failure}`)}</Notice>
      {!!progress.accounts?.length && <SingleChoice label={t("connect.chooseAccount")} value={account} onChange={setAccount} options={progress.accounts.map(a => ({ value: a.id, label: a.name || a.id }))} />}
      <Button variant="primary" busy={busy} disabled={!!progress.accounts?.length && !account} onClick={onRetry}>{t("retry")}</Button>
    </> : <ol className="remote-steps">{["login", "deploying", "connecting"].map((step, index) => <li key={step} aria-current={index === phase ? "step" : undefined}>
      <Icon icon={phase > index ? Check : Circle} /><div><strong>{t(`connect.phase.${step}`)}</strong>{step === "deploying" && <small>{t("connect.twentySeconds")}</small>}{phase === index && <Loading label={t("connect.inProgress")} />}</div>
    </li>)}</ol>}
    {progress.loginUrl && <Button variant="ghost" onClick={() => void copyText(progress.loginUrl!)}>{t("connect.copyLogin")}</Button>}
    <Button disabled={busy} onClick={onCancel}>{t("cancel")}</Button>
  </div>;
}
