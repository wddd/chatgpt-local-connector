// Reorder only the named members; hidden and disabled items keep their slots.
export function orderedSubset<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const ordered = [...new Set(ids)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const members = new Set(ordered.map(item => item.id));
  let index = 0;
  return items.map(item => members.has(item.id) ? ordered[index++] : item);
}
export function moveToY(items: readonly { id: string; y: number }[], id: string, y: number) {
  const others = items.filter(item => item.id !== id);
  const next = others.findIndex(item => y < item.y);
  const ids = others.map(item => item.id);
  ids.splice(next < 0 ? ids.length : next, 0, id);
  return ids;
}
