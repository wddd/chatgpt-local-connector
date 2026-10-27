import type { CatalogModel, DispatchCatalog } from '../../state/dispatchCatalog';
import type { DispatchSummary } from '../../types';

/** Match opaque IDs exactly; retain recorded IDs when native metadata is absent. */
export function modelLabel(model: string, models: CatalogModel[] = []): string {
  const row = models.find(row => row.model === model);
  const label = row?.displayName || row?.name;
  if (!label) return model;
  const ambiguous = models.some(other => other.model !== model && (other.displayName || other.name) === label && other.provider?.name !== row?.provider?.name);
  return ambiguous && row?.provider?.name ? `${label} · ${row.provider.name}` : label;
}

const effortKeys: Record<string, string> = Object.fromEntries(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(key => [key, `dispatchSpec.effort.${key}`]));

/** Format recorded values only; catalog options supply names, never defaults. */
export function dispatchSpecLabel(summary: DispatchSummary | undefined, catalog: DispatchCatalog | undefined, translate: (key: string) => string): string {
  const model = summary?.model, effort = summary?.effort?.trim(), tier = summary?.serviceTier?.trim();
  const models = Array.isArray(catalog?.models) ? catalog.models : [];
  const resolved = models.find(row => row.model === model);
  const options = resolved?.options ?? (model && [catalog?.currentModel, catalog?.optionsForModel].includes(model) ? catalog?.options : undefined);
  const effortOption = options?.filter(option => option.category === 'thought_level' || ['reasoning_effort', 'reasoningEffort', 'thinkingLevel', 'effort', 'thought_level'].includes(option.id))
    .flatMap(option => option.values ?? []).find(option => typeof option !== 'string' && option.value === effort);
  const effortName = typeof effortOption === 'object' && effortOption.name || (effort && effortKeys[effort] ? translate(effortKeys[effort]) : undefined);
  const tierName = tier && tier !== 'default' ? (tier === 'fast' || tier === 'priority' ? translate('activity.fast') : tier) : undefined;
  return [model ? modelLabel(model, models) : undefined, effortName, tierName].filter(Boolean).join(' · ');
}
