import { Button, EntityRow, StateBadge } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { t } from '../../../i18n';
import { statePresentation } from '../statePresentation';
import { memberDate, memberName, type Member } from './model';
export function RelayMemberRow({ member, deviceName, now, disabled, onRemove }: { member: Member; deviceName?: string; now: number; disabled?: boolean; onRemove?: () => void }) {
  return <EntityRow className="flex-wrap gap-2 [&_.entity-row-title]:wrap-anywhere [&_.entity-row-copy]:basis-30 [&_.sensitive-value]:max-w-full [&_.sensitive-value]:overflow-hidden [&_.status]:max-w-full [&_.status]:whitespace-normal [&>.actions]:min-w-0 [&>.actions]:max-w-full [&>.entity-row]:basis-72" title={<><Sensitive>{memberName(member, deviceName)}</Sensitive>{member.isSelf && <> · {t('hosting.self')}</>}</>} state={<StateBadge presentation={statePresentation('member', member.online ? 'online' : 'offline')} />} secondary={`${t('hosting.joined')} ${memberDate(member.joinedAt, now)} · ${t('hosting.lastSeen')} ${memberDate(member.lastOnline, now, true)}`} actions={!member.isSelf && onRemove && <Button variant="ghost" disabled={disabled} onClick={onRemove}>{t('hosting.remove')}</Button>} />;
}
