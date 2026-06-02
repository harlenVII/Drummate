import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBackend } from '../contexts/BackendContext';
import { purgeExpiredTrash } from '../services/database';

// Lean side-effect hook: runs the expired-trash purge on mount. All UI reads
// are now reactive via useLiveData, so the local Dexie deletes this performs
// propagate to the UI automatically — no manual refetch needed. We still push
// the corresponding remote deletes for any signed-in user.
export function useAppData() {
  const { user } = useAuth();
  const backend = useBackend();

  useEffect(() => {
    const purge = async () => {
      const { expiredItems, expiredNotes } = await purgeExpiredTrash();
      if (user) {
        for (const item of expiredItems) {
          backend.pushDeleteItem(item.uid, user.id).catch(console.error);
        }
        for (const note of expiredNotes) {
          backend.deleteNoteRemote(note.uid, user.id).catch(console.error);
        }
      }
    };
    purge();
  }, [user, backend]);
}
