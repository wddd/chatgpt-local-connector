import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { t } from '../i18n';
import { usePrivacy, setPrivacy } from '../state/privacy';
import { IconButton } from './ui';
export function Private({ children }: { children: ReactNode }) {
  const hidden = usePrivacy();
  return <span className="private-value" data-private={hidden || undefined} aria-label={hidden ? t('accounts.hidden') : undefined}><span aria-hidden={hidden || undefined}>{children}</span></span>;
}
export function PrivacyToggle() {
  const hidden = usePrivacy();
  return <IconButton icon={hidden ? EyeOff : Eye} label={t('accounts.privacy')} aria-pressed={hidden} onClick={() => setPrivacy(!hidden)} />;
}
