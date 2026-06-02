import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';

// Subscribe a React component to a Dexie liveQuery. `querier` is an async fn
// returning the value; `deps` re-subscribes when they change.
export function useLiveQuery(querier, deps = [], initial = undefined) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: setValue,
      error: (err) => console.error('liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
