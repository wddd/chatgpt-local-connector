import { DispatchSpec } from '../components/composites/DispatchSpec';
import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { RefreshCw, Plus, Check, X, Info, Plug, Bot } from 'lucide-react';
import { Button, IconButton, Switch, SingleChoice, Notice, Empty, Loading, Status, Tag, TooltipProvider,
  PlatformIcon, StateBadge, SectionHeader, EntityRow, EntityCard, FactList, Freshness, AddressField, ChoiceControl, SettingsSection, SettingRow, FormField, FormSection, ActionGroup, Disclosure, DangerZone } from '../components/ui';
import AgentQuota from '../components/AgentQuota';
import { AgentQuotaIcon } from '../subscriptions/QuotaRing';
import QuotaBubble from '../subscriptions/QuotaBubble';
import GraphNode from '../components/GraphNode';
import { ActivityBubble } from '../components/ActivityBubbles';
import { environment, type Environment } from './environment';
import { setActionTarget } from './data';
import { PortalHost } from './radix';

const components = { Button, IconButton, Switch, SingleChoice, Notice, Empty, Loading, Status, Tag,
  AgentQuotaIcon, AgentQuota, QuotaBubble, GraphNode, ActivityBubble,
  PlatformIcon, StateBadge, SectionHeader, EntityRow, EntityCard, FactList, Freshness, AddressField, ChoiceControl, SettingsSection, SettingRow, FormField, FormSection, ActionGroup, Disclosure, DangerZone, DispatchSpec };
const icons = { RefreshCw, Plus, Check, X, Info, Plug, Bot };
export function configure(value: Environment, target?: HTMLElement) {
  environment.set(value);
  if (target) setActionTarget(target);
}
export function mount(node: HTMLElement, name: keyof typeof components) {
  const root = createRoot(node);
  return {
    update(raw: Record<string, unknown>) {
      const props = { ...raw };
      if (name !== 'EntityCard' && typeof props.icon === 'string') props.icon = icons[props.icon as keyof typeof icons];
      if (typeof props.fallback === 'string') props.fallback = icons[props.fallback as keyof typeof icons];
      if (name === 'StateBadge') {
        const presentation = props.presentation as { icon: keyof typeof icons };
        props.presentation = { ...presentation, icon: icons[presentation.icon] };
      }
      if (Array.isArray(props.options)) props.options = props.options.map(option => ({ ...option,
        ...(typeof option.icon === 'string' ? { icon: icons[option.icon as keyof typeof icons] } : {}) }));
      if (name === 'ActivityBubble') props.now ??= environment.get().now;
      root.render(createElement(PortalHost.Provider, { value: node },
        createElement(TooltipProvider, null, createElement(components[name] as ComponentType<Record<string, unknown>>, props))));
    },
    unmount: () => root.unmount(),
  };
}
