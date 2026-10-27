import type { CSSProperties, ReactNode } from 'react';
import { Bot, Plug, Plus, type LucideIcon } from 'lucide-react';
import sources from '../../../shared/control-sources.json';
import { sourceImages, sourceVectors } from '../../assets/brand-reserve/control-sources';
import { agentIcons } from '../../assets/agentIcons';
import openai from '../../assets/agents/openai.svg';
import { Icon } from './index';
import { cn } from '../../lib/utils';

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
  return <span className={cn("platform-icon relative inline-grid shrink-0 place-items-center align-middle [&>img]:size-full [&>img]:object-contain [&_svg]:size-full", role === "source" && "source-icon size-8", role === "agent" && "agent-logo h-13/20 w-13/20", className)}
    style={size === undefined ? undefined : { width: size, height: size }} data-panel-visual={panelVisual || undefined} data-sized={size !== undefined || undefined} aria-hidden={quotaRing ? undefined : true}>
      {add ? <Icon icon={Plus} size={20} /> : vector ? <span className="flex size-full [&>svg]:block [&>svg]:size-full" aria-hidden="true" dangerouslySetInnerHTML={{ __html: vector }} />
        : image ? monochrome || monochromeAsset ? <span className="platform-mask block size-full bg-current mask-contain mask-center mask-no-repeat" aria-hidden="true" style={{ maskImage: `url(${JSON.stringify(image)})` } as CSSProperties} />
          : <img src={image} alt="" draggable={false} /> : <Icon icon={fallback ?? (role === 'source' ? Plug : Bot)} size={20} />}
    {quotaRing}
  </span>;
}
