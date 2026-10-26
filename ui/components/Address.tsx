import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { copyText } from '../platform';
import { maskSensitive } from '../privacyMask';
import { Sensitive } from './Sensitive';
import { AddressField } from './ui';

/** Clipboard and privacy owner for address/secret fields. */
export default function Address({ value, label, password = false, loading = false, disabled = false, placeholder = '' }: {
  value: string; label: string; password?: boolean; loading?: boolean; disabled?: boolean; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState('');
  useEffect(() => { setVisible(false); setCopied(false); setError(''); }, [value]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <AddressField value={value} label={label} loading={loading} disabled={disabled} placeholder={placeholder}
    display={<Sensitive>{password && !visible ? maskSensitive(value, true) : value}</Sensitive>}
    revealed={visible} onReveal={password ? () => setVisible(!visible) : undefined} copied={copied} error={error}
    onCopy={raw => { setError(''); void copyText(raw).then(() => setCopied(true)).catch(() => setError(t('copyFailedSelectAndCopyTheTextManually'))); }} />;
}
