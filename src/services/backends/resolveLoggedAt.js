import { legacyDateToLoggedAt } from '../../utils/tzDateHelpers.js';

export function resolveLoggedAt(remote) {
  if (typeof remote.logged_at === 'number') return remote.logged_at;
  if (remote.date) return legacyDateToLoggedAt(remote.date);
  // Malformed remote doc (no date, no logged_at). Return null so the
  // local row is visibly broken rather than getting a phantom Date.now()
  // stamp that masquerades as a real practice instant.
  return null;
}
