import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { locale, t } from "../i18n";
import { useInterval } from "../state/hooks";
import { Button, Empty, Notice } from "./ui";
import type { ControlSource } from "../state/types";
export default function OAuthGrants({
  ingressId,
  running,
  disabled,
  onBusy,
}: {
  ingressId: string;
  running: boolean;
  disabled?: boolean;
  onBusy: (value: boolean) => void;
}) {
  const [grants, setGrants] = useState<ControlSource[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      revision.current++;
    };
  }, []);
  async function refresh(afterAction = false) {
    if (busy && !afterAction) return;
    if (!running) {
      setGrants([]);
      setError("");
      return;
    }
    const version = revision.current;
    try {
      const result = await api<{ sources: ControlSource[] }>(
        `source`,
      );
      if (alive.current && version === revision.current) {
        setGrants(result.sources.filter(s => s.ingressId === ingressId));
        setError("");
      }
    } catch (e) {
      if (alive.current && version === revision.current) setError(String(e));
    }
  }
  useInterval(() => void refresh(), 3000, true);
  useEffect(() => {
    void refresh();
  }, [running]);
  async function action(id: string) {
    if (busy || disabled || !running) return;
    revision.current++;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await api(`source/${id}/disconnect`, "POST");
      await refresh(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="oauth-grants">
      <h3>OAuth</h3>
      {grants.map((grant) => {
        const timestamp = grant.connectedAt;
        const date = timestamp == null ? null : new Date(timestamp * 1000);
        return (
          <div className="oauth-grant-row" key={grant.id}>
            <strong className="oauth-grant-name" title={grant.label}>{grant.label}</strong>
            <span className="muted small oauth-grant-time" title={t(grant.connectedAt == null ? "oauthRegisteredAt" : "oauthConnectedAt")}>
              {date ? (
                <time dateTime={date.toISOString()}>
                  {date.toLocaleString(locale.get(), { hour12: false })}
                </time>
              ) : t("oauthTimeUnknown")}
            </span>
            <Button
              disabled={busy || disabled || !running || grant.state === "revoked"}
              onClick={() => void action(grant.id)}
            >
              {t("oauthRevoke")}
            </Button>
          </div>
        );
      })}
      {!grants.length && !error && (
        <Empty>{t("oauthNoGrants")}</Empty>
      )}
      {error && <Notice>{error}</Notice>}
    </section>
  );
}
