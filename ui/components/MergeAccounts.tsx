import { useId, useState } from 'react';
import { accountsApi } from '../api';
import type { ProviderAccount } from '../types';
import { accounts, refreshAccounts } from '../state/accounts';
import { subscriptions } from '../state/subscriptions';
import { navigation } from '../state/navigation';
import { t } from '../i18n';
import { Button, Checkbox, Dialog, FormSection, FormField, Input, Notice, SingleChoice } from './ui';

export default function MergeAccounts({ account, onClose }: { account: ProviderAccount; onClose: () => void }) {
  const { items } = accounts.use(), { snapshot } = subscriptions.use();
  const formId = useId(), aliasId = useId();
  const [ids, setIds] = useState<string[]>([]), [alias, setAlias] = useState(account.alias);
  const [quotaId, setQuotaId] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const members = [account, ...items.filter(item => ids.includes(item.id))];
  const agents = new Set(members.flatMap(item => item.agentProfiles.map(profile => profile.agent)));
  const providers = snapshot?.providers.filter(provider => provider.agentIds.some(agent => agents.has(agent))) ?? [];
  const quotaProviderId = quotaId ?? account.quotaProviderId ?? providers.find(provider => provider.productUsage?.shared)?.providerId ?? 'native';
  async function merge() {
    setBusy(true); setError('');
    try {
      const result = await accountsApi.merge({ into: account.id, ids, alias: alias.trim(), quotaProviderId: quotaProviderId === 'native' ? null : quotaProviderId });
      await refreshAccounts();
      navigation.set(old => ({ ...old, accountId: result.id }));
      onClose();
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <Dialog centered title={t('accounts.mergeTitle', { alias: account.alias })} busy={busy} onClose={onClose}
    footer={<><Button disabled={busy} onClick={onClose}>{t('cancel')}</Button><Button variant="primary" type="submit" form={formId} disabled={!ids.length || !alias.trim()} busy={busy}>{t('accounts.mergeConfirm')}</Button></>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void merge(); }}><FormSection>
    <p>{t('accounts.mergeConsequence')}</p>
    <FormSection>{items.filter(item => item.id !== account.id).map(item => <Checkbox key={item.id} checked={ids.includes(item.id)} disabled={busy}
      onChange={checked => setIds(old => checked ? [...old, item.id] : old.filter(id => id !== item.id))}>{item.alias} · {[item.sources.length ? 'SRC' : '', item.agentProfiles.length ? 'AGENT' : ''].filter(Boolean).join(' / ')}</Checkbox>)}</FormSection>
    <FormField id={aliasId} label={t('accounts.mergeAlias')}><Input id={aliasId} required maxLength={120} value={alias} disabled={busy} onChange={event => setAlias(event.target.value)} /></FormField>
    <SingleChoice label={t('accounts.mergeQuota')} value={quotaProviderId} disabled={busy}
      options={[{ value: 'native', label: t('accounts.mergeNativeQuota') }, ...providers.map(provider => ({ value: provider.providerId, label: provider.name }))]} onChange={setQuotaId} />
    {error && <Notice>{error}</Notice>}
    </FormSection></form>
  </Dialog>;
}
