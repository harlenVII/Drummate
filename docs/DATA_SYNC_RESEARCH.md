# Data Sync & Cross-Device Access — Technical Research

## Problem

Drummate stores all data in IndexedDB (via Dexie.js) in the browser. If the user switches to another browser or device, they lose access to their practice history.

---

## Possible Solutions

### Solution 1: Manual Export/Import (JSON file)

```
[IndexedDB] → export → JSON file → transfer → import → [IndexedDB on new device]
```

| Aspect | Details |
|--------|---------|
| **Effort** | Low (~50 lines of code) |
| **Cost** | Free |
| **Sync** | Manual, user-initiated |
| **Multi-device** | No real-time sync, just backup/restore |

**How it works:** Add "Export Data" / "Import Data" buttons. User downloads a JSON file and loads it on another device.

**Advantages:**
- Zero infrastructure, zero cost
- Works offline
- User owns their data (full control)
- Simplest to implement

**Disadvantages:**
- Manual and tedious
- No real-time sync
- Easy to forget to export
- Risk of data divergence if editing on multiple devices

---

### Solution 2: Dexie Cloud (built for your stack)

```
[Dexie.js] ←sync→ [Dexie Cloud service] ←sync→ [Dexie.js on other device]
```

| Aspect | Details |
|--------|---------|
| **Effort** | Low — already using Dexie.js, ~20 lines to add sync |
| **Cost** | Free tier available (check current limits) |
| **Sync** | Automatic, real-time |
| **Multi-device** | Yes, with user authentication |

**How it works:** Same Dexie.js API you already use, just add `dexie-cloud-addon`. Data syncs automatically across devices.

```javascript
// Minimal change to existing database.js
import Dexie from 'dexie';
import dexieCloud from 'dexie-cloud-addon';

const db = new Dexie('drummate', { addons: [dexieCloud] });
db.version(1).stores({ items: '@id, name', logs: '@id, itemId, date' });
db.cloud.configure({ databaseUrl: 'https://your-db.dexie.cloud' });
```

**Advantages:**
- Minimal code change (existing Dexie.js API preserved)
- Built specifically for Dexie.js
- Handles conflict resolution
- Offline-first by design
- Real-time sync across devices

**Disadvantages:**
- Vendor lock-in to Dexie Cloud
- Requires user accounts / authentication
- Paid plans needed for larger usage
- Third-party service dependency

---

### Solution 3: Firebase / Supabase / PocketBase

```
[IndexedDB] ←sync layer→ [Cloud DB] ←sync→ [Other device]
```

| Option | Cost | Self-hostable | Real-time sync | Auth built-in |
|--------|------|--------------|----------------|---------------|
| **Firebase** | Generous free tier | No | Yes | Yes |
| **Supabase** | Free tier (500 MB) | Yes | Yes | Yes |
| **PocketBase** | Free (self-host) | Yes (single binary) | Yes | Yes |

**Advantages:**
- Battle-tested at scale
- Authentication included
- Real-time sync
- Rich ecosystem and documentation

**Disadvantages:**
- Requires rewriting database layer (replace Dexie.js calls with cloud SDK)
- Need to handle offline/online sync yourself
- More complex architecture
- Ongoing service dependency

---

### Solution 4: CRDTs / Local-First Sync Libraries

```
[Local DB] ←CRDT merge→ [Sync server] ←CRDT merge→ [Local DB on other device]
```

| Library | Approach | Works with Dexie? |
|---------|----------|-------------------|
| **Replicache** | Mutation-based sync | Replaces local DB |
| **PowerSync** | Postgres sync to SQLite | Replaces Dexie |
| **ElectricSQL** | Postgres ↔ local sync | Replaces Dexie |
| **Automerge / Yjs** | CRDT data structures | Can layer on top |

**Advantages:**
- Best conflict resolution (mathematically guaranteed)
- True offline-first
- No data loss on merge

**Disadvantages:**
- Overkill for Drummate's simple data model (items + logs)
- Replaces current DB layer entirely
- Steeper learning curve
- More infrastructure to manage

---

### Solution 5: Cloud Storage File Sync (iCloud / Google Drive)

```
[Export JSON] → save to iCloud/Google Drive → [auto-syncs] → import on other device
```

**Advantages:**
- Users already have cloud storage accounts
- No backend needed
- Familiar mental model for users

**Disadvantages:**
- Complex APIs (especially iCloud from a PWA)
- Not real-time
- Requires native-like file access which PWAs have limited support for

---

## Comparison

| | Export/Import | Dexie Cloud | Firebase/Supabase | CRDTs | Cloud Storage |
|--|--------------|-------------|-------------------|-------|---------------|
| **Code changes** | ~50 lines | ~20 lines | Rewrite DB layer | Rewrite DB layer | ~100 lines |
| **Real-time sync** | No | Yes | Yes | Yes | No |
| **Cost** | Free | Free tier | Free tier | Varies | Free |
| **Offline-first** | Yes | Yes | Partial | Yes | Yes |
| **User accounts** | No | Yes (required) | Yes (required) | Yes (required) | No |
| **Complexity** | Trivial | Low | Medium | High | Medium |
| **Existing DB changes** | None | Minimal | Full rewrite | Full rewrite | None |

---

## Recommendation

### Phased approach:

**Phase 1 (Now): Export/Import JSON**
- Takes an afternoon to implement
- Solves the immediate pain point
- No accounts, no infrastructure, no cost
- Already planned in Phase 9 of the roadmap

**Phase 2 (Later): Dexie Cloud**
- Lowest-friction path to real-time sync since the app already uses Dexie.js
- Minimal code changes — enhances existing `database.js` rather than replacing it
- Preserves offline-first architecture
- Firebase/Supabase would mean rewriting the entire data layer; Dexie Cloud does not

---

*Last updated: 2026-02-11*
