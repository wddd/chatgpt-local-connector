import { createContext, createElement, useContext, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createRuntime } from 'virtual:arc-runtime';
import type * as UI from '../components/ui';
import type AgentQuotaComponent from '../components/AgentQuota';
import type { AgentQuotaIcon as AgentQuotaIconComponent } from '../subscriptions/QuotaRing';
import type QuotaBubbleComponent from '../subscriptions/QuotaBubble';
import type GraphNodeComponent from '../components/GraphNode';
import type { ActivityBubble as ActivityBubbleComponent } from '../components/ActivityBubbles';
import type SourceIconComponent from '../components/SourceIcon';
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

export type IconName = 'RefreshCw' | 'Plus' | 'Check' | 'X' | 'Info';
const iconNames: readonly string[] = ['RefreshCw', 'Plus', 'Check', 'X', 'Info'];
type TextProps<P> = Omit<P, 'children' | 'ref' | 'action' | 'icon' | 'dangerouslySetInnerHTML'> &
  (P extends { children: unknown } ? { children: string } : { children?: string });
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
      for (const key of ['children', 'action']) {
        if (raw[key] != null && typeof raw[key] !== 'string') throw new Error(`Arc.${name}.${key} accepts plain text only across React versions.`);
      }
      if (raw.ref != null || raw.dangerouslySetInnerHTML != null) throw new Error(`Arc.${name} does not accept ref or dangerouslySetInnerHTML.`);
      const checkIcon = (value: unknown) => {
        if (value != null && (typeof value !== 'string' || !iconNames.includes(value))) throw new Error(`Arc.${name}.icon requires one of ${iconNames.join(', ')}.`);
      };
      checkIcon(raw.icon);
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
export const SourceIcon = island<ComponentProps<typeof SourceIconComponent>>('SourceIcon');
