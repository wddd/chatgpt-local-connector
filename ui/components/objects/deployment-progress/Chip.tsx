import type { RelayProgress } from '../../../state/relay';
import { Button, StateBadge } from '../../ui';
import { t } from '../../../i18n';
import { statePresentation } from '../statePresentation';
import './deployment-progress.css';
export function DeploymentProgressChip({ progress, onOpen, disabled }: { progress: RelayProgress; onOpen?: () => void; disabled?: boolean }) {
  const label = progress.action === 'delete' ? t('hosting.deleteTitle') : progress.action === 'redeploy' ? t('connect.updateRelay') : progress.action === 'create' ? t('hosting.deploy') : undefined;
  const content = <>{label && <span>{label} ·</span>}<StateBadge variant="compact" presentation={statePresentation('deployment', progress.cancelled ? 'cancelled' : progress.phase)} /></>;
  return onOpen ? <Button className="deployment-progress-chip" variant="ghost" disabled={disabled} onClick={onOpen}>{content}</Button> : <span className="deployment-progress-chip">{content}</span>;
}
