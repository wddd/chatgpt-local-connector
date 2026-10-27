import registry from '../shared/control-sources.json';
import { t } from './i18n';

// Metadata never constrains the backend's open-ended controlSource string.
export const controlSources = registry;
export const curatedSources = controlSources.filter(source => source.curated);
export function controlSource(id: string) {
  return controlSources.find(source => source.id === id);
}
export function sourceProductName(id: string, compact = false) {
  if (id === 'custom') return t('setup.otherClient');
  const info = controlSource(id);
  return (compact ? info?.shortName : info?.displayName) ?? t('setup.otherClient');
}
export function nextSourceName(id: string, names: string[]) {
  const base = sourceProductName(id);
  let name = base, suffix = 2;
  while (names.includes(name)) name = `${base} ${suffix++}`;
  return name;
}

export type CapabilityProfile = { hostAccess: "host" | "none" | "unknown"; waitMode: "background-cli" | "push" | "poll" };
