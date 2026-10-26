import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { Button, Notice } from "./ui";
type Policy = { criteria: string; agents: Record<string, { model?: string | null; effort?: string | null; criteria?: string }> };
export default function DispatchPolicy({ agent }: { agent: string }) {
  const [policy, setPolicy] = useState<Policy>(), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api<Policy>("agents/dispatch-policy").then(value => { if (active) { setPolicy(value); setError(""); } }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [retry]);
  const defaults = policy?.agents[agent];
  return <section className="account-card">
    <h3>{t("object.dispatchPolicy")}</h3>
    {error ? <Notice action={<Button onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button>}>{error}</Notice> : !policy ? <p role="status">{t("loading")}</p> : <>
      <dl className="source-facts"><div><dt>{t("object.defaultModel")}</dt><dd>{defaults?.model || t("object.nativeDefault")}</dd></div><div><dt>{t("object.defaultEffort")}</dt><dd>{defaults?.effort || t("object.nativeDefault")}</dd></div></dl>
      {policy.criteria && <p className="policy-criteria">{policy.criteria}</p>}{defaults?.criteria && <p className="policy-criteria">{defaults.criteria}</p>}
    </>}
  </section>;
}
