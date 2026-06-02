import { useSyncExternalStore } from 'react';
import { subscribeTimezone, getTimezone } from '../services/timezoneService';

// Reactive home-timezone string. Subscribes to timezoneService so consumers
// re-render when the user changes their timezone in Settings. Returned value
// is used as a liveQuery dependency (in useLiveData totals and useReports log
// ranges) so those queries re-bucket immediately on a timezone change.
export function useTimezone() {
  return useSyncExternalStore(subscribeTimezone, getTimezone, getTimezone);
}
