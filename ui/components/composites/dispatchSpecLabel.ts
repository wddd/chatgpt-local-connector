import type { CatalogModel } from '../../state/dispatchCatalog';

/** Match opaque IDs exactly and display only explicit native metadata. */
export function modelLabel(model: string, models: CatalogModel[] = []): string {
  const row = models.find(row => row.model === model);
  if (!row?.displayName) return model;
  const ambiguous = models.some(other => other.model !== model && other.displayName === row.displayName && other.provider?.name !== row.provider?.name);
  return ambiguous && row.provider?.name ? `${row.displayName} · ${row.provider.name}` : row.displayName;
}
