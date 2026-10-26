import type { CSSProperties, ReactNode } from 'react';
import { Bot, Plug, Plus, type LucideIcon } from 'lucide-react';
import sources from '../../../shared/control-sources.json';
import { sourceImages, sourceVectors } from '../../assets/brand-reserve/control-sources';
import { agentIcons } from '../../assets/agentIcons';
import openai from '../../assets/agents/openai.svg';
import { Icon } from './index';

const providerImages = import.meta.glob('../../assets/brand-reserve/agents/*/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
type Role = 'source' | 'agent' | 'provider';
function asset(platform: string, role: Role) {
  if (role === 'source') {
    const key = sources.find(source => source.id === platform)?.icon ?? platform;
    return { vector: Object.hasOwn(sourceVectors, key) ? sourceVectors[key] : undefined, image: Object.hasOwn(sourceImages, key) ? sourceImages[key] : undefined };
  }
  if (role === 'agent') return { vector: Object.hasOwn(agentIcons, platform) ? agentIcons[platform] : undefined };
  const monochrome = platform === 'codex' ? openai : providerImages[`../../assets/brand-reserve/agents/${platform}/mono.svg`];
  return { image: monochrome ?? providerImages[`../../assets/brand-reserve/agents/${platform}/color.svg`], monochrome: !!monochrome };
}

/** Decorative branding only. A quota slot owns its own accessible name. */
export function PlatformIcon({ platform, role, size, quotaRing, fallback, add = false, panelVisual = false, className = '', monochrome = false }: {
  platform: string; role: Role; size?: number; quotaRing?: ReactNode; fallback?: LucideIcon;
  add?: boolean; panelVisual?: boolean; className?: string; monochrome?: boolean;
}) {
  const { vector, image, monochrome: monochromeAsset } = asset(platform, role);
  return <span className={`platform-icon ${role === 'source' ? 'source-icon' : role === 'agent' ? 'agent-logo' : ''} ${className}`}
    style={size === undefined ? undefined : { width: size, height: size }} data-panel-visual={panelVisual || undefined} data-sized={size !== undefined || undefined} aria-hidden={quotaRing ? undefined : true}>
      {add ? <Icon icon={Plus} size={20} /> : vector ? <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: vector }} />
        : image ? monochrome || monochromeAsset ? <span className="platform-mask" aria-hidden="true" style={{ maskImage: `url(${JSON.stringify(image)})` } as CSSProperties} />
          : <img src={image} alt="" draggable={false} /> : <Icon icon={fallback ?? (role === 'source' ? Plug : Bot)} size={20} />}
    {quotaRing}
  </span>;
}
