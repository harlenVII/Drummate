// The Practice tab always highlights exactly one active item (unless there are
// none). The stored choice can go stale — the item gets archived, trashed,
// merged away, or deleted by sync — so resolve it against the current items:
// the stored item if still active, else the running item, else the first item
// in on-screen order (Fundamentals column, then Songs).
export function resolveFocusedItemId(items, focusedId, activeItemId) {
  const active = items.filter(i => !i.archived && !i.trashed);
  const isActive = (id) => id != null && active.some(i => i.id === id);
  if (isActive(focusedId)) return focusedId;
  if (isActive(activeItemId)) return activeItemId;
  const first = active.find(i => i.category === 'fundamentals') ?? active.find(i => i.category === 'songs');
  return first?.id ?? null;
}
