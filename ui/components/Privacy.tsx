import { Eye, EyeOff } from 'lucide-react';
import { t } from '../i18n';
import { usePrivacy, setPrivacy } from '../state/privacy';
import { IconButton } from './ui';
export function PrivacyToggle() {
  const hidden = usePrivacy();
  return <IconButton icon={hidden ? EyeOff : Eye} label={t('accounts.privacy')} aria-pressed={hidden} onClick={() => setPrivacy(!hidden)} />;
}
