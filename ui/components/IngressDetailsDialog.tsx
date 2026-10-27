import { TunnelCard } from "./objects/tunnel";
import { Button, Dialog, DialogClose } from "./ui";
import { useState } from "react";
import { t } from "../i18n";
import { navigation } from "../state/navigation";
import { connector } from "../state/connector";
import type { Ingress } from "../state/types";
import IngressConnection from "./IngressConnection";

// Provider-specific connection forms remain available for existing advanced entries.
export default function IngressDetailsDialog({ ingress, onClose, onEdit }: {
  ingress: Ingress; onClose: () => void; onEdit: (ingress: Ingress) => void;
}) {
  const { status, sources } = connector.use();
  const entry = status?.ingresses.find(i => i.id === ingress.id) ?? ingress;
  const [busy, setBusy] = useState(false);
  const managed = ["relay", "local"].includes(entry.transport);
  return <Dialog title={entry.name}
    onClose={onClose} busy={busy} footer={<>
      <Button disabled={busy} onClick={() => { if (managed) { onClose(); navigation.set(old => ({ ...old, page: "remote" })); } else onEdit(entry); }}>{t(managed ? "connect.manage" : "edit")}</Button><span className="spacer flex-1" />
      <DialogClose asChild><Button variant="primary" disabled={busy}>{t("done")}</Button></DialogClose>
    </>}>
    <TunnelCard ingress={entry} sources={sources} busy={busy} address={managed ? undefined : null} />
    {!managed && <IngressConnection ingress={ingress} onBusy={setBusy} />}
  </Dialog>;
}
