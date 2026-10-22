import { useState } from "react";
import { t } from "../i18n";
import { connector, ingressState } from "../state/connector";
import type { Ingress } from "../state/types";
import IngressConnection from "./IngressConnection";
import { Button, Dialog, DialogClose, Status } from "./ui";

// The permissions page retains its workspace dialog; connection actions are shared with the home dock.
export default function IngressDetailsDialog({ ingress, onClose, onEdit }: {
  ingress: Ingress; onClose: () => void; onEdit: (ingress: Ingress) => void;
}) {
  const { status } = connector.use();
  const entry = status?.ingresses.find(i => i.id === ingress.id) ?? ingress;
  const [busy, setBusy] = useState(false);
  const state = ingressState(entry);
  return <Dialog title={<span className="ingress-dialog-title">{entry.name}<Status tone={state === "connectionError" ? "danger" : state === "connected" ? "success" : "neutral"}>{t(state)}</Status></span>}
    onClose={onClose} busy={busy} footer={<>
      <Button disabled={busy} onClick={() => onEdit(entry)}>{t("edit")}</Button><span className="spacer" />
      <DialogClose asChild><Button variant="primary" disabled={busy}>{t("done")}</Button></DialogClose>
    </>}>
    <IngressConnection ingress={ingress} onBusy={setBusy} />
  </Dialog>;
}
