import { Badge } from '../../ui/badge';
import { locale, t } from '../../../i18n';
import { remoteProfiles, type RemoteProfile } from '../../../controlSources';
import type { ControlSource, Ingress, OAuthRequest } from '../../../state/types';
import { Button, Field, Input, PlatformIcon, SingleChoice, StateBadge } from '../../ui';
import { useSensitiveText } from '../../Sensitive';
import { RequestCard, type RequestCardProps } from '../../composites/RequestCard';
import { statePresentation } from '../statePresentation';
export type AuthorizationRequestCardProps = {
  request: OAuthRequest; ingress: Ingress; inline?: boolean; busy?: boolean; error?: string; labelError?: string;
  sourceId: string; onSourceChange: (id: string) => void; label: string; onLabelChange: (label: string) => void;
  profile: RemoteProfile; onProfileChange: (profile: RemoteProfile) => void;
  candidates: ControlSource[]; fixed?: ControlSource; oldConnection?: Ingress; remaining: ControlSource[];
  onDecide: (allow: boolean) => void; pager?: RequestCardProps["pager"];
};
export function AuthorizationRequestCard({ request, ingress, inline, busy, error, labelError, sourceId, onSourceChange, label, onLabelChange, profile, onProfileChange, candidates, fixed, oldConnection, remaining, onDecide, pager }: AuthorizationRequestCardProps) {
  const protect = useSensitiveText([oldConnection?.name ?? fixed?.connectionName ?? ""]);
  const valid = !!request.switchSourceId || sourceId === 'new' || candidates.some(source => source.id === sourceId);
  return <RequestCard leading={request.product && <PlatformIcon role="source" platform={request.product} size={20} />} pager={pager} title={request.clientName} inline={inline} formId={`approval-${request.id}`} busy={busy} error={error} onSubmit={e => { e.preventDefault(); const allow = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') !== 'deny'; if (!busy && request.status === 'pending' && (!allow || valid)) onDecide(allow); }}
    footer={!inline && request.status === 'pending' && <><Button disabled={busy} onClick={() => onDecide(false)}>{t('oauthDeny')}</Button><Button type="submit" variant="primary" busy={busy} disabled={!valid}>{t('oauthAllow')}</Button></>}>

    {request.status === "pending" ? <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-lg bg-muted p-4 text-sm"><span>{t("connect.compareCode")}</span><strong className="whitespace-nowrap font-mono text-2xl font-semibold tracking-widest">{request.pairingCode ?? "—"}</strong></div>
      {request.switchSourceId && <><div><Badge variant="secondary" className="max-w-full whitespace-normal wrap-anywhere">{t("switch.claim", { name: fixed?.label ?? t("source.connectionRemoved") })}</Badge></div><p className="text-sm">{protect(t(fixed?.connectionRemoved ? "switch.detached" : "switch.remaining", { connection: oldConnection?.name ?? fixed?.connectionName ?? t("source.connectionRemoved"), names: remaining.map(s => s.label).join(", ") || t("switch.none") }))}</p></>}
      {!request.switchSourceId && candidates.length > 0 && <SingleChoice label={t("source.authorization")} value={sourceId} onChange={onSourceChange} disabled={busy} options={[{ value: "new", label: t("source.new") }, ...candidates.map(s => ({ value: s.id, label: t("source.reauthorize", { name: s.label }) }))]} />}
      {!request.switchSourceId && sourceId === "new" && <Field id={`approval-label-${request.id}`} label={t("setup.accountName")} error={labelError}>
        <Input id={`approval-label-${request.id}`} value={label} disabled={busy} aria-invalid={!!labelError} aria-describedby={labelError ? `approval-label-${request.id}-error` : undefined} onChange={e => { onLabelChange(e.target.value); }} />
      </Field>}
      {!request.switchSourceId && sourceId === "new" && <Field label={t("source.profile")}><SingleChoice label={t("source.profile")} value={profile} onChange={value => onProfileChange(value as RemoteProfile)} disabled={busy} options={remoteProfiles.map(value => ({ value, label: t(`source.profile.${value}`) }))} /></Field>}
      {request.expiresAt !== undefined && <time dateTime={new Date(request.expiresAt * 1000).toISOString()}>{t('authorization.expires', { time: new Date(request.expiresAt * 1000).toLocaleString(locale.get()) })}</time>}
      <p className="text-xs text-muted-foreground">{t("connect.scope", { scope: ingress.toolPolicy === "all" ? t("connect.allPermissions") : t("connect.selectedPermissions") })}</p>

    </> : <p><StateBadge className="max-w-full whitespace-normal" variant="text" presentation={statePresentation("authorization", request.status)} label={request.status === "approved" ? t("connect.returning") : request.status === "denied" ? t("oauthDenied") : undefined} /></p>}
  </RequestCard>;
}
