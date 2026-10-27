import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { t } from '../i18n';
import { maskSensitive } from '../privacyMask';
import { Sensitive } from './Sensitive';
import { CopyValue } from './composites/CopyValue';
import { ContextIcon } from './composites/ContextIcon';

/** Privacy remains owned here; copying always uses the explicit raw value. */
export default function Address({ value, label, password = false, loading = false, disabled = false, placeholder = '' }: {
  value: string; label: string; password?: boolean; loading?: boolean; disabled?: boolean; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(false), [value]);
  return <CopyValue value={value} disabled={disabled || loading}>
    <span className="min-w-0 break-all font-mono text-xs" role="textbox" aria-readonly="true" aria-label={label} aria-busy={loading} tabIndex={0}
      onCopyCapture={event => { event.preventDefault(); event.stopPropagation(); if (!disabled && !loading && value) event.clipboardData.setData('text/plain', value); }}>
      {value ? <Sensitive>{password && !visible ? maskSensitive(value, true) : value}</Sensitive> : placeholder}
    </span>
    {password && <ContextIcon icon={visible ? EyeOff : Eye} label={t(visible ? 'hideSecret' : 'showSecret')} disabled={disabled || loading || !value} onClick={() => setVisible(!visible)} />}
  </CopyValue>;
}
