import { createContext, createElement, useContext, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createRuntime } from 'virtual:arc-runtime';
import type * as UI from '../components/ui';
import type AgentQuotaComponent from '../components/AgentQuota';
import type { AgentQuotaIcon as AgentQuotaIconComponent } from '../subscriptions/QuotaRing';
import type QuotaBubbleComponent from '../subscriptions/QuotaBubble';
import type GraphNodeComponent from '../components/GraphNode';
import type { ActivityBubble as ActivityBubbleComponent } from '../components/ActivityBubbles';
import type { Environment } from './environment';
import { fixtures } from './fixtures';
import { bubbleHeights, type BubbleDensity } from '../state/activityModel';

type Runtime = ReturnType<typeof createRuntime>;
const Context = createContext<{ runtime: Runtime; environment: Environment } | null>(null);
export type RootProps = Partial<Environment> & { children?: ReactNode };
export function Root({ mode = 'light', locale = 'en', privacy = false, now = fixtures.now, children }: RootProps) {
  if (!['light', 'dark'].includes(mode) || !['en', 'zh-CN'].includes(locale) || typeof privacy !== 'boolean' || !Number.isFinite(now)) {
    throw new Error('Arc.Root requires mode light/dark, locale en/zh-CN, boolean privacy and finite epoch milliseconds now.');
  }
  const environment = { mode, locale, privacy, now };
  const [runtime] = useState(() => {
    const instance = createRuntime();
    instance.configure(environment);
    return instance;
  });
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { runtime.configure(environment, node.current!); }, [runtime, mode, locale, privacy, now]);
  return createElement(Context.Provider, { value: { runtime, environment } },
    createElement('div', { ref: node, className: 'arc-root', 'data-theme': mode, 'data-theme-color': 'arc',
      'data-reduced-motion': 'true', lang: locale, style: { colorScheme: mode } }, children));
}

export type IconName = 'RefreshCw' | 'Plus' | 'Check' | 'X' | 'Info' | 'Plug' | 'Bot';
const iconNames: readonly string[] = ['RefreshCw', 'Plus', 'Check', 'X', 'Info', 'Plug', 'Bot'];
type TextProps<P> = Omit<P, 'children' | 'ref' | 'action' | 'icon' | 'dangerouslySetInnerHTML'> &
  (P extends { children: unknown } ? { children: string } : { children?: string });
type TextSlots<P, K extends keyof P> = Omit<{ [Key in keyof P]: Key extends K ? string : P[Key] }, 'ref' | 'dangerouslySetInnerHTML'>;
const textSlots: Record<string, readonly string[]> = {
  PlatformIcon: ['quotaRing'],
  SectionHeader: ['title', 'leading', 'actions', 'back', 'close', 'widthControl', 'secondary', 'titleActions'],
  EntityRow: ['leading', 'title', 'secondary', 'state', 'actions'],
  EntityCard: ['icon', 'title', 'headerActions', 'footer', 'danger'],
  Freshness: ['age', 'unknown'], AddressField: ['display'],
};
function island<P extends object>(name: string) {
  function Island(props: P) {
    const context = useContext(Context);
    if (!context) throw new Error(`Arc.${name} requires an enclosing Arc.Root.`);
    const { runtime, environment } = context;
    const node = useRef<HTMLDivElement>(null);
    const mounted = useRef<ReturnType<Runtime['mount']> | null>(null);
    useLayoutEffect(() => {
      mounted.current = runtime.mount(node.current!, name);
      return () => { mounted.current?.unmount(); mounted.current = null; };
    }, [runtime]);
    useLayoutEffect(() => {
      const raw = props as Record<string, unknown>;
      const checkText = (value: unknown, key: string) => {
        if (value != null && typeof value !== 'string') throw new Error(`Arc.${name}.${key} accepts plain text only across React versions.`);
      };
      for (const key of ['children', 'action', ...(textSlots[name] ?? [])]) checkText(raw[key], key);
      if (raw.ref != null || raw.dangerouslySetInnerHTML != null) throw new Error(`Arc.${name} does not accept ref or dangerouslySetInnerHTML.`);
      if (raw.asChild || raw.titleAsChild) throw new Error(`Arc.${name} does not support asChild or titleAsChild across React versions.`);
      if (raw.titleProps != null) {
        const titleProps = raw.titleProps as Record<string, unknown>;
        if (titleProps.children != null || titleProps.ref != null || titleProps.dangerouslySetInnerHTML != null) {
          throw new Error(`Arc.${name}.titleProps accepts heading attributes only, without children, ref or dangerouslySetInnerHTML.`);
        }
      }
      const checkIcon = (value: unknown, key = 'icon') => {
        if (value != null && (typeof value !== 'string' || !iconNames.includes(value))) throw new Error(`Arc.${name}.${key} requires one of ${iconNames.join(', ')}.`);
      };
      if (name !== 'EntityCard') checkIcon(raw.icon);
      checkIcon(raw.fallback, 'fallback');
      if (name === 'StateBadge') checkIcon((raw.presentation as { icon?: unknown } | undefined)?.icon, 'presentation.icon');
      if (name === 'FactList') {
        for (const [index, item] of (raw.items as { label: unknown; value?: unknown }[]).entries()) {
          checkText(item.label, `items[${index}].label`);
          checkText(item.value, `items[${index}].value`);
        }
        if (raw.missing && 'placeholder' in (raw.missing as object)) checkText((raw.missing as { placeholder: unknown }).placeholder, 'missing.placeholder');
      }
      if (Array.isArray(raw.options)) for (const option of raw.options) {
        checkIcon(option.icon);
        if (option.graphic != null && typeof option.graphic !== 'string') throw new Error('Arc.SingleChoice option.graphic accepts plain text only.');
      }
      mounted.current!.update({ ...raw, ...(name === 'ActivityBubble' ? { now: raw.now ?? environment.now } : {}) });
    });
    const density = (props as { density?: BubbleDensity }).density ?? 'standard';
    return createElement('div', { className: 'arc-island', ref: node, 'data-arc-component': name,
      style: name === 'ActivityBubble' ? { height: bubbleHeights[density] } : undefined });
  }
  Island.displayName = `Arc.${name}`;
  return Island;
}
export const Button = island<TextProps<ComponentProps<typeof UI.Button>>>('Button');
export const IconButton = island<Omit<ComponentProps<typeof UI.IconButton>, 'icon' | 'ref'> & { icon: IconName }>('IconButton');
export const Switch = island<ComponentProps<typeof UI.Switch>>('Switch');
type Choice = Omit<UI.Choice, 'icon' | 'graphic'> & { icon?: IconName; graphic?: string };
export const SingleChoice = island<Omit<ComponentProps<typeof UI.SingleChoice>, 'options'> & { options: readonly Choice[] }>('SingleChoice');
export const Notice = island<TextProps<ComponentProps<typeof UI.Notice>> & { action?: string }>('Notice');
export const Empty = island<TextProps<ComponentProps<typeof UI.Empty>> & { action?: string; icon?: IconName }>('Empty');
export const Loading = island<ComponentProps<typeof UI.Loading>>('Loading');
export const Status = island<TextProps<ComponentProps<typeof UI.Status>>>('Status');
export const Tag = island<TextProps<ComponentProps<typeof UI.Tag>>>('Tag');
export const AgentQuotaIcon = island<ComponentProps<typeof AgentQuotaIconComponent>>('AgentQuotaIcon');
export const AgentQuota = island<ComponentProps<typeof AgentQuotaComponent>>('AgentQuota');
export const QuotaBubble = island<ComponentProps<typeof QuotaBubbleComponent>>('QuotaBubble');
export const GraphNode = island<TextProps<ComponentProps<typeof GraphNodeComponent>>>('GraphNode');
export const ActivityBubble = island<Omit<ComponentProps<typeof ActivityBubbleComponent>, 'now'> & { now?: number }>('ActivityBubble');
export const PlatformIcon = island<Omit<TextSlots<ComponentProps<typeof UI.PlatformIcon>, 'quotaRing'>, 'fallback'> & { fallback?: IconName }>('PlatformIcon');
type BadgeProps = ComponentProps<typeof UI.StateBadge>;
export const StateBadge = island<Omit<BadgeProps, 'presentation'> & { presentation: Omit<BadgeProps['presentation'], 'icon'> & { icon: IconName } }>('StateBadge');
type HeaderProps = TextSlots<ComponentProps<typeof UI.SectionHeader>, 'children' | 'title' | 'leading' | 'actions' | 'back' | 'close' | 'widthControl' | 'secondary' | 'titleActions'>;
export const SectionHeader = island<Omit<HeaderProps, 'titleProps' | 'titleAsChild'> & {
  titleProps?: Omit<NonNullable<HeaderProps['titleProps']>, 'children' | 'dangerouslySetInnerHTML'>;
  titleAsChild?: false;
}>('SectionHeader');
export const EntityRow = island<TextSlots<ComponentProps<typeof UI.EntityRow>, 'children' | 'leading' | 'title' | 'secondary' | 'state' | 'actions'>>('EntityRow');
export const EntityCard = island<Omit<TextSlots<ComponentProps<typeof UI.EntityCard>, 'children' | 'icon' | 'title' | 'headerActions' | 'footer' | 'danger'>, 'asChild'> & { asChild?: false }>('EntityCard');
export const FactList = island<Omit<ComponentProps<typeof UI.FactList>, 'items' | 'missing'> & {
  items: readonly { label: string; value?: string | null; key?: string }[];
  missing: { omit: true } | { placeholder: string };
}>('FactList');
export const Freshness = island<TextSlots<ComponentProps<typeof UI.Freshness>, 'age' | 'unknown'>>('Freshness');
export const AddressField = island<TextSlots<ComponentProps<typeof UI.AddressField>, 'display'>>('AddressField');
