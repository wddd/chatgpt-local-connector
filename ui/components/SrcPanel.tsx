import { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useReducedMotion } from "../state/appEnvironment";
import { t } from "../i18n";
import { connector } from "../state/connector";
import { useAccounts } from "../state/accounts";
import { srcPanel, selectSourcePanel } from "../state/overviewPanels";
import { controlSource } from "../controlSources";
import { isLocalSource, isPendingSource } from "../sourcePresentation";
import type { SurfaceRect } from "../motion/surface";
import SourcePanel from "./SourcePanel";
import SourceIcon from "./SourceIcon";
import ChangeConnection from "./ChangeConnection";
import { connectionSwitch, openOnboarding } from "../state/onboarding";
import { PrivacyToggle } from "./Privacy";
import { Button, Dialog, DialogClose, Empty, HoverScope, IconButton, Notice, Status, Tag } from "./ui";

export default function SrcPanel({ onPanelFrame, width, expanded, onToggleWidth, dockRect }: {
  onPanelFrame: (rect: SurfaceRect | null) => void; width?: number; dockRect?: SurfaceRect; expanded: boolean; onToggleWidth: () => void;
}) {
  const switching = connectionSwitch.use(), selected = srcPanel.use()!;
  const { status, sources } = connector.use(), accountState = useAccounts();
  const source = sources.find(source => source.id === selected.sourceId);
  const candidates = sources.filter(source => source.product === selected.platform && !isLocalSource(source) && source.state !== "revoked" && !isPendingSource(source, status?.ingresses ?? []));
  const rows = [...new Map(candidates.map(source => {
    const account = accountState.items.find(account => account.sources.includes(source.id));
    return [account?.id ?? source.id, { account, source }];
  })).values()];
  const verified = rows.some(({ account }) => account?.notifications.reachable === true || account?.notifications.state === "verified");
  const title = controlSource(selected.platform)?.displayName ?? selected.platform;
  const reduced = useReducedMotion(), content = useRef<HTMLDivElement>(null), previous = useRef(selected.sourceId);
  useLayoutEffect(() => {
    const prior = previous.current;
    previous.current = selected.sourceId;
    if (prior && !selected.sourceId) (content.current?.querySelector<HTMLElement>(`[data-source-account="${CSS.escape(prior)}"]`) ?? content.current?.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
  }, [selected.sourceId]);
  const back = () => selectSourcePanel(selected.platform, { platformOnly: true });
  const widthControl = !dockRect && <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? "restorePanelWidth" : "expandPanelWidth")} aria-pressed={expanded} onClick={onToggleWidth} />;
  return <Dialog width={width} dockRect={dockRect} dock="left" expanded={expanded} headerless title={source?.label ?? title}
    originKey={`${selected.platform}:${selected.sourceId ?? ""}`} closeRequested={selected.closing} onBack={selected.sourceId ? back : undefined}
    onCloseStart={() => srcPanel.set(old => old && { ...old, closing: true })}
    onClose={() => { if (srcPanel.get()?.closing) srcPanel.set(undefined); }}
    returnFocus={`[data-source-node="${CSS.escape(source?.id ?? `platform:${selected.platform}`)}"] button, [data-source-node] button`} onPanelFrame={onPanelFrame}>
    <div ref={content} className="agent-panel-view">
      <motion.div className="side-panel-layer" style={{ display: selected.sourceId ? "none" : "flex" }} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        <header className="dialog-header source-account-header"><SourceIcon platform={selected.platform} /><h2 tabIndex={-1}>{title}</h2><div className="actions"><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t("close")} /></DialogClose></div></header>
        <div className="side-panel-scroll source-panel-content">
          <div className="source-section-heading"><h3>{t("accounts.title")}</h3><Button onClick={() => openOnboarding("connection", { source: selected.platform })}>{t("accounts.add")}</Button></div>
          <HoverScope>{rows.map(({ account, source }) => <Button key={account?.id ?? source.id} data-source-account={source.id} data-hover-target={account?.id ?? source.id} variant="ghost" className="account-list-row" onClick={() => selectSourcePanel(selected.platform, { sourceId: source.id })}>
            <span className="account-avatar"><SourceIcon platform={selected.platform} /></span><span className="account-row-copy"><strong>{account?.alias ?? source.label}</strong><span className="account-chips">{candidates.filter(item => account ? account.sources.includes(item.id) : item.id === source.id).map(item => <Tag key={item.id}>{status?.ingresses.find(ingress => ingress.id === item.ingressId)?.name ?? item.connectionName ?? t("source.connectionRemoved")}</Tag>)}</span></span><Status tone={source.state === "connected" ? "success" : "neutral"}>{t(`source.state.${source.state}`)}</Status>
          </Button>)}</HoverScope>
          {!rows.length && <Empty>{t("accounts.empty")}</Empty>}
          <section className="account-card"><div className="source-section-heading"><h3>{t("accounts.notifications")}</h3><Status tone={verified ? "success" : "neutral"}>{t(verified ? "accounts.notifications.verified" : "accounts.notifications.not-bound")}</Status></div></section>
          {accountState.error && <Notice>{accountState.error}</Notice>}
        </div>
      </motion.div>
      {selected.sourceId && <motion.div key={selected.sourceId} className="side-panel-layer" initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}>
        {source ? <SourcePanel source={source} onBack={back} widthControl={widthControl} /> : <><Button onClick={back}>{t("back")}</Button><Notice>{t("accounts.identityUnavailable")}</Notice></>}
      </motion.div>}
    </div>
    {switching && <ChangeConnection />}
  </Dialog>;
}
