import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../../platform';
import { t } from '../../i18n';
import { ContextIcon } from './ContextIcon';

/** Supply display for masked or already-rendered values; clipboard always receives value. */
export function CopyValue({ value, children, label = t('copy'), disabled = false, onCopy = copyText, floating = false }: {
  value: string; children?: ReactNode; label?: string; disabled?: boolean; onCopy?: (value: string) => void | Promise<void>; floating?: boolean;
}) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setCopied(false); setError(''); }, [value]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <span className={floating ? "absolute right-1 top-1 z-10 rounded-md bg-card text-foreground shadow-sm opacity-0 group-hover/context:opacity-100 group-focus-within/context:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100" : "inline-flex min-w-0 max-w-full flex-wrap items-center gap-1"}>
    {children === undefined ? <span className="min-w-0 break-all font-mono text-xs">{value}</span> : children}
    <ContextIcon icon={copied ? Check : Copy} label={copied ? t('copied') : label} disabled={disabled || !value} busy={busy} onClick={async () => {
      setBusy(true); setError(''); try { await onCopy(value); setCopied(true); } catch { setError(t('copyFailedSelectAndCopyTheTextManually')); } finally { setBusy(false); }
    }} />
    {copied && <span className="sr-only" role="status">{t('copied')}</span>}{error && <span className="basis-full text-xs text-destructive" role="alert">{error}</span>}
  </span>;
}
