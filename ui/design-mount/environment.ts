import { createStore } from './store';
import type { Locale } from '../i18n';
export type Environment = { mode: 'light' | 'dark'; locale: Locale; privacy: boolean; now: number };
export const environment = createStore<Environment>({ mode: 'light', locale: 'en', privacy: false, now: Date.UTC(2026, 9, 26, 12) });
export const useNow = () => environment.use().now;
export const useAppNow = useNow;
export const appNow = () => environment.get().now;
export const useReducedMotion = () => true;
export const environmentMedia = (query: string) => ({
  matches: query === '(prefers-reduced-motion: reduce)' ? true : matchMedia(query).matches,
  addEventListener() {}, removeEventListener() {},
});
