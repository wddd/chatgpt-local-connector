import { EntityRow, StateBadge, Button, SettingsSection, Icon, Tooltip, Notice } from "./ui";
import { statePresentation } from "./objects/statePresentation";
import { useEffect, useState } from "react";
import { Accessibility, Bell, HardDrive, LogIn, Monitor, RefreshCw, type LucideIcon } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";
import { isDesktop } from "../platform";
import { connector, notify } from "../state/connector";
import { permissions, refreshPermissions, type PermissionItem } from "../state/permissions";

const systemIds = ["accessibility", "screen-recording", "full-disk-access", "notifications", "login-start"];
const icons: Record<string, LucideIcon> = { accessibility: Accessibility, "screen-recording": Monitor, "full-disk-access": HardDrive, notifications: Bell, "login-start": LogIn };
function combined(a?: PermissionItem, b?: PermissionItem): string {
  const states = [a?.state ?? "unknown", b?.state ?? "unknown"];
  return states.includes("missing") ? "missing" : states.includes("unknown") ? "unknown" : states.every(s => s === "not-applicable") ? "not-applicable" : "granted";
}
export default function SystemPermissions() {
  const { data, loading, error } = permissions.use();
  const [acting, setActing] = useState(false);
  const busy = loading || acting;
  const { status } = connector.use();
  useEffect(() => {
    void refreshPermissions().catch(error => notify(String(error), true));
  }, []);
  const find = (id: string) => data?.items.find(item => item.id === id);
  const disk = find("full-disk-access"), commandDisk = find("command-full-disk-access");
  const appName = disk?.grantTarget?.split("/").pop()?.replace(/\.app$/, "") || "Agent Remote Control";
  const rows = systemIds.map(id => ({ id, state: id === "full-disk-access" ? combined(disk, commandDisk) : find(id)?.state ?? "unknown" }));
  const mac = status?.platform === "darwin";
  const visible = rows.filter(row => row.state !== "not-applicable" && (mac || !systemIds.includes(row.id)));
  async function act(id: string) {
    setActing(true);
    try {
      if (id === "login-start") await api("service", "POST", { enabled: true });
      else await api("permissions/request", "POST", { id });
      await refreshPermissions();
    } catch (e) { notify(String(e), true); }
    finally { setActing(false); }
  }
  function badge(state: string, authorization: boolean) {
    const ready = state === "granted";
    const key = !["granted", "missing"].includes(state) ? "permissionState.unknown" : ready ? (authorization ? "permissionsGranted" : "permissionState.granted") : authorization ? "permissionsNotGranted" : "permissionState.missing";
    return <StateBadge presentation={statePresentation("permission", state)} label={t(key)} variant="compact" />;
  }
  function row(item: {id: string; state: string}) {
    const authorization = item.id !== "login-start";
    return <EntityRow className="flex-wrap gap-3 py-3 [&.entity-row]:p-0 [&.entity-row-actions]:border-b [&.entity-row-actions]:last:border-0 [&>.actions]:ms-8 [&>.actions]:max-w-full @2xl:[&>.actions]:ms-auto [&>.entity-row]:basis-60" key={item.id} leading={<><Tooltip text={t("permissionTools." + item.id)}><span className="flex text-muted-foreground" tabIndex={0}><Icon icon={icons[item.id]} size={20} /></span></Tooltip></>} title={<><h3 className="text-sm font-semibold">{t("permission." + item.id)}</h3></>} secondary={<><p className="text-xs leading-relaxed">{t("permissionUse." + item.id)}</p>{item.id === "full-disk-access" && disk && commandDisk && disk.state !== commandDisk.state && <p className="text-xs text-muted-foreground">{t("permissionsDiskMismatch")}</p>}</>} actions={<>{badge(item.state, authorization)}{item.state !== "granted" && <Button disabled={busy || !isDesktop} onClick={() => void act(item.id).catch(e => notify(String(e), true))}>
          {t(item.id === "login-start" ? "permissionsEnable" : "permissionsGrant")}
        </Button>}</>} />;
  }
  return <div className="@container min-w-0">
    <Button disabled={busy} onClick={() => void refreshPermissions().catch(error => notify(String(error), true))}><Icon icon={RefreshCw} />{t("permissionsRefresh")}</Button>
    {error && <Notice>{error}</Notice>}
    {data && <>
      {mac && <SettingsSection title={t("permissionsSystem")}><p className="text-xs text-muted-foreground">{t("permissionsAppHint", {app: appName})}</p>{visible.map(row)}</SettingsSection>}
    </>}
  </div>;
}
