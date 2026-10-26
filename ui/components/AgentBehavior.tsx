import { api } from "../api";
import { t } from "../i18n";
import { connector, run, refreshConnector } from "../state/connector";
import { Row, Switch } from "./ui";
export default function AgentBehavior({ agent }: { agent: string }) {
  const { status, busy } = connector.use();
  if (agent !== "codex") return null;
  return <Row title={t("automaticallyOpenCodexTasks")}>
    <Switch label={t("automaticallyOpenCodexTasks")} checked={status?.autoOpenCodex !== false} disabled={!!busy || !status}
      onChange={autoOpenCodex => void run("task-settings", async () => { await api("task-settings", "PUT", { autoOpenCodex }); await refreshConnector(); })} />
  </Row>;
}
