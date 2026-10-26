import { usePrivacy } from '../../../state/privacy';
import { maskSensitive } from '../../../privacyMask';
import { EntityCard, FactList, StateBadge } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { t } from '../../../i18n';
import { statePresentation } from '../statePresentation';
import { memberDate, memberName, type Member } from './model';
export function RelayMemberCard({ member, deviceName, now }: { member: Member; deviceName?: string; now: number }) {
  const hidden = usePrivacy(), name = memberName(member, deviceName);
  return <EntityCard title={<Sensitive>{memberName(member, deviceName)}</Sensitive>} headerActions={<StateBadge presentation={statePresentation('member', member.online ? 'online' : 'offline')} />}>
    {member.isSelf && <span>{t('hosting.self')}</span>}
    {!member.isSelf && <p>{t('hosting.removeDescription', { name: hidden ? maskSensitive(name, true) : name })}</p>}
    <FactList items={[{ label: t('hosting.joined'), value: memberDate(member.joinedAt, now) }, { label: t('hosting.lastSeen'), value: memberDate(member.lastOnline, now, true) }]} missing={{ omit: true }} />
  </EntityCard>;
}
