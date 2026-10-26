import { t } from '../../../i18n';
export type Member = { id: string; name: string; isSelf: boolean; joinedAt: string; lastOnline: string | null; online: boolean };
export function memberName(member: Member, deviceName?: string) { return member.isSelf ? deviceName || t('connect.thisComputer') : member.name; }
export function memberDate(value: string | null, now: number, recent = false) {
  if (!value) return t('connect.neverOnline');
  const date = new Date(value), age = now - date.getTime();
  if (!Number.isFinite(date.getTime())) return t('connect.neverOnline');
  if (recent && age >= 0 && age < 120_000) return t('hosting.justNow');
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
