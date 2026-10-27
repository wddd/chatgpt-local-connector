import { Icon } from "./ui";
import { Link } from "lucide-react";
import { t } from "../i18n";
export function AccountSharedNotice() {
  return <div className="flex items-start gap-2 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground [&>.icon]:mt-0.5 [&>.icon]:shrink-0" role="note"><Icon icon={Link} /><span>{t('accounts.sharedQuota')}</span></div>;
}
