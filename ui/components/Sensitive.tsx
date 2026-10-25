import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { t } from '../i18n';
import { maskSensitive, sensitiveParts } from '../privacyMask';
import { usePrivacy } from '../state/privacy';
import { accounts } from '../state/accounts';
import { connector } from '../state/connector';

export function Sensitive({ children = '' }: { children?: string | null }) {
  const hidden = usePrivacy(), element = useRef<HTMLSpanElement>(null);
  const value = children ?? '', replacement = maskSensitive(value);
  const [metrics, setMetrics] = useState<{ width: number; scale: number }>();
  useLayoutEffect(() => {
    const node = element.current;
    if (!node || !value) { setMetrics(undefined); return; }
    // Measure off-DOM: no invisible raw-text mirror, title or data attribute.
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const measure = () => {
      const style = getComputedStyle(node);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.letterSpacing = style.letterSpacing;
      const width = context.measureText(value).width, maskedWidth = context.measureText(replacement).width;
      setMetrics(old => old?.width === width && old.scale === width / maskedWidth ? old : { width, scale: maskedWidth ? width / maskedWidth : 1 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    document.fonts?.addEventListener('loadingdone', measure);
    return () => { observer.disconnect(); document.fonts?.removeEventListener('loadingdone', measure); };
  }, [value, replacement]);
  return <span ref={element} className="sensitive-value" style={metrics ? { inlineSize: metrics.width } : undefined}
    aria-label={hidden && value ? t('accounts.hidden') : undefined}
    onCopy={hidden ? event => { event.preventDefault(); event.clipboardData.setData('text/plain', value); } : undefined}>
    <span className={hidden ? 'pii' : undefined} aria-hidden={hidden || undefined}
      style={hidden && metrics ? { transform: `scaleX(${metrics.scale})` } : undefined}>{hidden ? replacement : value}</span>
  </span>;
}

export function SensitiveIdentity({ email, orgName }: { email?: string | null; orgName?: string | null }) {
  return <span className="sensitive-identity">{email && <Sensitive>{email}</Sensitive>}{email && orgName && ' · '}{orgName && <Sensitive>{orgName}</Sensitive>}</span>;
}

// Editable sensitive fields are read-only while hidden. Values remain in React state.
export function SensitiveInput({ value = '', onChange, readOnly, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value?: string }) {
  const hidden = usePrivacy();
  return <input {...props} className={`input ${props.className ?? ''}`} value={hidden ? maskSensitive(value, true) : value}
    readOnly={hidden || readOnly} onChange={hidden ? undefined : onChange} aria-description={hidden ? t('accounts.hidden') : props['aria-description']}
    onCopy={hidden ? event => { event.preventDefault(); event.clipboardData.setData('text/plain', value); } : props.onCopy} />;
}

export function useSensitiveText(additionalValues: readonly string[] = []) {
  const hidden = usePrivacy(), { items } = accounts.use(), { status } = connector.use();
  const values = items.flatMap(account => [account.email, account.orgName, account.identityKey, ...account.notifications.sessions.map(session => session.target)])
    .concat(status?.ingresses.flatMap(ingress => [ingress.url, ingress.config.tunnelId, ingress.config.httpsUrl]) ?? [])
    .filter((value): value is string => !!value).concat(additionalValues);
  return (text: string) => hidden ? sensitiveParts(text, values).map(part => part.sensitive ? maskSensitive(part.text, true) : part.text).join('') : text;
}

