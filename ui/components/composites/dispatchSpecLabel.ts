import type { CatalogModel } from '../../state/dispatchCatalog';

/** Match opaque IDs exactly and display only explicit native metadata. */
export function modelLabel(model: string, models: CatalogModel[] = []): string {
  const row = models.find(row => row.model === model);
  const label = row?.displayName || row?.name;
  if (!label) return '';
  const ambiguous = models.some(other => other.model !== model && (other.displayName || other.name) === label && other.provider?.name !== row?.provider?.name);
  return ambiguous && row?.provider?.name ? `${label} · ${row.provider.name}` : label;
}
