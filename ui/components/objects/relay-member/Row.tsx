import { Button, EntityRow, StateBadge } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { t } from '../../../i18n';
import { statePresentation } from '../statePresentation';
import { memberDate, memberName, type Member } from './model';
export function RelayMemberRow({ member, deviceName, now, disabled, onRemove }: { member: Member; deviceName?: string; now: number; disabled?: boolean; onRemove?: () => void }) {
  return <EntityRow title={<><Sensitive>{memberName(member, deviceName)}</Sensitive>{member.isSelf && <> · {t('hosting.self')}</>}</>} state={<StateBadge presentation={statePresentation('member', member.online ? 'online' : 'offline')} />} secondary={`${t('hosting.joined')} ${memberDate(member.joinedAt, now)} · ${t('hosting.lastSeen')} ${memberDate(member.lastOnline, now, true)}`} actions={!member.isSelf && onRemove && <Button variant="ghost" disabled={disabled} onClick={onRemove}>{t('hosting.remove')}</Button>} />;
}
