import { dispatchCatalogFixtures } from './dispatchFixtures';
export function useDispatchCatalog(agent: string) {
  return { status: 'ready' as const, catalog: dispatchCatalogFixtures[agent] ?? { unavailable: 'design-fixture-catalog-unavailable' } };
}
