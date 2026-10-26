import { useSensitiveText } from '../../Sensitive';
import type { AgentInteraction } from '../../../types';
import type { ApprovalSubmission } from '../../../state/activityModel';
import { Button, StateBadge, Tag } from '../../ui';
import { statePresentation } from '../statePresentation';
import { t } from '../../../i18n';
export function InteractionRequestChip({ interaction, submission, onOpen, disabled, count, className }: { interaction: AgentInteraction; submission?: ApprovalSubmission; onOpen?: () => void; disabled?: boolean; count?: number; className?: string }) {
  const protect = useSensitiveText([interaction.path ?? '', interaction.cwd ?? '']);
  const label = protect(interaction.title || interaction.summary || t('detail.needsYou'));
  const content = count === undefined ? <>{label}{submission && <StateBadge variant="compact" presentation={statePresentation('submission', submission.status)} />}</> : <><span><strong>{t('detail.needsYou')} · {count}</strong><span>{label}</span></span><span>{t('detail.openRequest')}</span></>;
  return onOpen ? <Button className={className} aria-haspopup={count !== undefined ? "dialog" : undefined} variant={count !== undefined ? "secondary" : "ghost"} disabled={disabled} onClick={onOpen}>{content}</Button> : <Tag>{content}</Tag>;
}
