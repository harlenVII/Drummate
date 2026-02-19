# PocketBase Integration Plan — Drummate

## Overview

Migrate Drummate from local-only IndexedDB (Dexie.js) to PocketBase (self-hosted) for cross-device sync with offline support. PocketBase runs on a Singapore VPS, accessible from both China and internationally.

**Why PocketBase over Firebase:** Firebase (Google) is blocked in mainland China. PocketBase is self-hosted, lightweight (single Go binary, ~15MB RAM), and fits on cheap infrastructure.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Browser (PWA)                      │
│                                     │
│  ┌─────────┐    ┌────────────────┐  │
│  │ Dexie   │◄──►│ Sync Service   │  │
│  │ (local) │    │ (online/queue) │  │
│  └────┬────┘    └───────┬────────┘  │
│       │                 │           │
│  App reads/writes    PocketBase     │
│  from Dexie always   JS SDK        │
└───────┼─────────────────┼───────────┘
        │                 │
   Always fast     ┌──────▼──────┐
   Works offline   │ PocketBase  │
                   │ (Singapore) │
                   │ SQLite      │
                   └─────────────┘
```

**Strategy: Dexie stays as the local source of truth.** The app always reads/writes Dexie for instant response. A sync service mirrors changes to/from PocketBase in the background.

- **Online:** Write Dexie → push to PocketBase → real-time subscription pulls remote changes back to Dexie
- **Offline:** Write Dexie → queue pending changes → flush on reconnect
- **Not signed in:** Dexie only (current behavior, no sync)

This preserves the existing offline-first PWA experience while adding cloud sync.

---

## Phase 1: PocketBase Server Setup (AWS EC2 — Singapore)

### 1.1 Why AWS

| | **AWS EC2 (t4g.small)** | Oracle Free Tier | Fly.io |
|--|--|--|--|
| **Cost** | **$0 through Dec 2026** (free trial), then ~$6/mo | $0 forever | ~$5/mo |
| **Singapore region** | **Yes** (`ap-southeast-1`) | Yes | Yes |
| **Always-on** | **Yes** | Yes | Yes |
| **Specs** | ARM Graviton2, 2 vCPU, 2GB RAM | ARM 1 OCPU, 6GB RAM | Shared 256MB |
| **Storage** | 30GB EBS (free tier) | 50GB | 1-3GB |
| **Outbound data** | 100 GB/mo free | 10 TB/mo | 100GB/mo |
| **Signup** | **US address OK** | US address OK | Any |

> **Recommendation:** AWS EC2 t4g.small in Singapore (`ap-southeast-1`). The T4g free trial gives 750 hours/month free through Dec 31, 2026 — enough to run one instance 24/7 at $0. ARM Graviton2 runs PocketBase natively (Go supports arm64). After the free trial, t4g.micro (~$3/mo) is more than enough for PocketBase.

### 1.2 AWS Free Tier Details

- **T4g free trial:** 750 hours/month of `t4g.small` (2 vCPU, 2GB RAM) — extended through **December 31, 2026**
- **EBS storage:** 30 GB of General Purpose (gp3) — free for 12 months
- **Elastic IP:** 1 public IPv4 — free while attached to a running instance
- **Outbound data:** 100 GB/month free
- **Region:** Singapore (`ap-southeast-1`) — confirmed eligible for T4g free trial

> **After free trial ends (Jan 2027):** Downgrade to `t4g.micro` (2 vCPU, 1GB RAM) at ~$3/mo, or switch to `t4g.nano` at ~$1.50/mo. PocketBase only needs ~15MB RAM.

### 1.3 Setup Steps

#### Step 1: Create AWS Account

1. Sign up at [aws.amazon.com](https://aws.amazon.com) with your US address + credit card
2. Complete identity verification

#### Step 2: Launch EC2 Instance

1. Go to **EC2 → Instances → Launch Instance**
2. Configure:
   - **Name:** `drummate-api`
   - **Region:** Asia Pacific (Singapore) `ap-southeast-1` (select from top-right dropdown)
   - **AMI:** Ubuntu Server 24.04 LTS (ARM64)
   - **Instance type:** `t4g.small` (Free trial eligible)
   - **Key pair:** Create new or select existing `.pem` key
   - **Network settings:**
     - Allow SSH (port 22) from your IP
     - Allow HTTPS (port 443) from anywhere
     - Allow Custom TCP (port 8080) from anywhere
   - **Storage:** 30 GB gp3 (free tier)
3. Click **Launch Instance**

#### Step 3: Allocate Elastic IP (Static Public IP)

1. Go to **EC2 → Elastic IPs → Allocate Elastic IP address**
2. Click **Allocate**
3. Select the new IP → **Actions → Associate Elastic IP address**
4. Associate with your `drummate-api` instance

> **Why:** Without an Elastic IP, the public IP changes on every reboot.

#### Step 4: Install PocketBase on the VM

```bash
# SSH into the instance
ssh -i ~/your-key.pem ubuntu@<your-elastic-ip>

# Update system
sudo apt update && sudo apt upgrade -y
sudo apt install -y unzip

# Download PocketBase (ARM64 build for Graviton)
PB_VERSION=0.36.1
wget https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_arm64.zip
unzip pocketbase_${PB_VERSION}_linux_arm64.zip -d ~/pocketbase
rm pocketbase_${PB_VERSION}_linux_arm64.zip

# Test it works
~/pocketbase/pocketbase serve --http=0.0.0.0:8080
# Visit: http://<your-elastic-ip>:8080/_/
# Ctrl+C to stop
```

#### Step 5: Run PocketBase as a systemd Service

```bash
# Create systemd service file
sudo tee /etc/systemd/system/pocketbase.service > /dev/null <<EOF
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/home/ubuntu/pocketbase/pocketbase serve --http=0.0.0.0:8080
WorkingDirectory=/home/ubuntu/pocketbase
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable pocketbase
sudo systemctl start pocketbase

# Check status
sudo systemctl status pocketbase
```

#### Step 6: (Optional) HTTPS with Caddy

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Configure reverse proxy
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
drummate-api.yourdomain.com {
    reverse_proxy localhost:8080
}
EOF

# Restart Caddy
sudo systemctl restart caddy
```

> With Caddy, PocketBase is accessible at `https://drummate-api.yourdomain.com`. Point your domain's DNS A record to the Elastic IP. Caddy handles TLS certificates automatically via Let's Encrypt.

### 1.4 Admin Setup

1. Open `http://<your-elastic-ip>:8080/_/` (or `https://drummate-api.yourdomain.com/_/` if using Caddy)
2. Create superuser account
3. Create collections (Phase 2)
4. Set API rules (Phase 3)

---

## Phase 2: PocketBase Collections

### 2.1 `users` Collection (Auth type — built-in)

PocketBase auto-creates this. Default fields: `id`, `email`, `password`, `verified`, `created`, `updated`.

Add custom field:
| Field | Type | Required |
|-------|------|----------|
| `name` | text | No |

### 2.2 `practice_items` Collection (Base type)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | text | Auto | System field (15-char string) |
| `name` | text | Yes | e.g., "Paradiddles" |
| `user` | relation → `users` | Yes | Single relation, owner |
| `created` | autodate | Auto | System field |
| `updated` | autodate | Auto | System field |

### 2.3 `practice_logs` Collection (Base type)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | text | Auto | System field |
| `item` | relation → `practice_items` | Yes | Single relation |
| `user` | relation → `users` | Yes | Single relation, owner (denormalized) |
| `date` | text | Yes | "YYYY-MM-DD" format |
| `duration` | number | Yes | Seconds |
| `created` | autodate | Auto | System field |
| `updated` | autodate | Auto | System field |

### 2.4 Indexes

Created via PocketBase admin UI or migrations:

```sql
CREATE INDEX idx_items_user ON practice_items (user);
CREATE INDEX idx_logs_user_date ON practice_logs (user, date);
CREATE INDEX idx_logs_item ON practice_logs (item);
```

### 2.5 ID Strategy

- **Dexie (current):** Auto-increment integers (`++id`)
- **PocketBase:** 15-character alphanumeric strings
- Both Dexie and PocketBase IDs coexist — the sync service maps between them
- Dexie gets a new `remoteId` field to track the PocketBase ID for each record

Updated Dexie schema:
```javascript
db.version(3).stores({
  practiceItems: '++id, name, remoteId',
  practiceLogs: '++id, itemId, date, duration, remoteId',
  syncQueue: '++id, action, collection, localId, payload',
});
```

---

## Phase 3: PocketBase API Rules

Users can only access their own data:

**`practice_items`:**
```
listRule:   @request.auth.id != "" && user = @request.auth.id
viewRule:   @request.auth.id != "" && user = @request.auth.id
createRule: @request.auth.id != ""
updateRule: @request.auth.id != "" && user = @request.auth.id
deleteRule: @request.auth.id != "" && user = @request.auth.id
```

**`practice_logs`:**
```
listRule:   @request.auth.id != "" && user = @request.auth.id
viewRule:   @request.auth.id != "" && user = @request.auth.id
createRule: @request.auth.id != ""
updateRule: @request.auth.id != "" && user = @request.auth.id
deleteRule: @request.auth.id != "" && user = @request.auth.id
```

---

## Phase 4: Client SDK Setup

### 4.1 Install

```bash
npm install pocketbase
```

### 4.2 Create `src/services/pocketbase.js`

```javascript
import PocketBase from 'pocketbase';

const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://drummate-api.yourdomain.com';

export const pb = new PocketBase(POCKETBASE_URL);
```

### 4.3 Environment Variable

Add to `.env`:
```
VITE_POCKETBASE_URL=https://drummate-api.yourdomain.com
```

> **Note:** PocketBase SDK is 14 KB gzipped (vs Firebase's 70 KB). Auth tokens are auto-persisted to localStorage by the SDK.

---

## Phase 5: Authentication

### 5.1 Auth Methods

- **Email/password** (primary) — works everywhere including China
- **No Google OAuth** — Google is blocked in China, defeats the purpose

### 5.2 Auth Context

Create `src/contexts/AuthContext.jsx`:

```javascript
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { pb } from '../services/pocketbase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if existing token is still valid
    if (pb.authStore.isValid) {
      pb.collection('users').authRefresh()
        .then(() => setUser(pb.authStore.record))
        .catch(() => { pb.authStore.clear(); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    // Listen for auth changes
    const unsubscribe = pb.authStore.onChange((token, record) => {
      setUser(record);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email, password) => {
    await pb.collection('users').authWithPassword(email, password);
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    await pb.collection('users').create({
      email, password, passwordConfirm: password, name,
    });
    await pb.collection('users').authWithPassword(email, password);
  }, []);

  const signOut = useCallback(() => {
    pb.authStore.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### 5.3 Auth Screen

Create `src/components/AuthScreen.jsx`:

- Email/password form (primary — works in China)
- Sign up / sign in toggle
- Name field on sign up
- Error display
- Bilingual support via `t()`
- Matches existing Tailwind card style

### 5.4 Auth Flow

```
App Mount
  → Check pb.authStore.isValid
  → If valid → refresh token → show main app
  → If invalid → show AuthScreen
  → After sign-in → trigger initial sync → show main app
```

---

## Phase 6: Sync Service

This is the core of the integration. The sync service bridges Dexie (local) and PocketBase (remote).

### 6.1 Sync Architecture

```
              ┌──── WRITE PATH ────┐
              │                    │
  App writes  │   If online:       │
  to Dexie ───┤   → push to PB    │
              │                    │
              │   If offline:      │
              │   → queue in       │
              │     syncQueue      │
              └────────────────────┘

              ┌──── READ PATH ─────┐
              │                    │
  App reads   │   Always from      │
  from Dexie ─┤   Dexie (instant)  │
              │                    │
              │   PB subscription  │
              │   updates Dexie    │
              │   in background    │
              └────────────────────┘
```

### 6.2 Create `src/services/sync.js`

```javascript
import { pb } from './pocketbase';
import { db } from './database';

// --- Push local changes to PocketBase ---

export async function pushItem(localItem, userId) {
  try {
    if (localItem.remoteId) {
      // Update existing
      await pb.collection('practice_items').update(localItem.remoteId, {
        name: localItem.name,
      });
    } else {
      // Create new
      const record = await pb.collection('practice_items').create({
        name: localItem.name,
        user: userId,
      });
      // Store the remote ID back in Dexie
      await db.practiceItems.update(localItem.id, { remoteId: record.id });
    }
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('create_item', 'practice_items', localItem.id, {
        name: localItem.name,
      });
    } else {
      throw err;
    }
  }
}

export async function pushLog(localLog, userId) {
  try {
    // Resolve the remote item ID
    const item = await db.practiceItems.get(localLog.itemId);
    const remoteItemId = item?.remoteId;
    if (!remoteItemId) {
      await queueSync('create_log', 'practice_logs', localLog.id, {
        itemId: localLog.itemId, date: localLog.date, duration: localLog.duration,
      });
      return;
    }

    const record = await pb.collection('practice_logs').create({
      item: remoteItemId,
      user: userId,
      date: localLog.date,
      duration: localLog.duration,
    });
    await db.practiceLogs.update(localLog.id, { remoteId: record.id });
  } catch (err) {
    if (!navigator.onLine) {
      await queueSync('create_log', 'practice_logs', localLog.id, {
        itemId: localLog.itemId, date: localLog.date, duration: localLog.duration,
      });
    } else {
      throw err;
    }
  }
}

// --- Sync queue for offline writes ---

async function queueSync(action, collection, localId, payload) {
  await db.syncQueue.add({ action, collection, localId, payload });
}

export async function flushSyncQueue(userId) {
  const pending = await db.syncQueue.toArray();
  for (const entry of pending) {
    try {
      if (entry.action === 'create_item') {
        const localItem = await db.practiceItems.get(entry.localId);
        if (localItem) await pushItem(localItem, userId);
      } else if (entry.action === 'create_log') {
        const localLog = await db.practiceLogs.get(entry.localId);
        if (localLog) await pushLog(localLog, userId);
      } else if (entry.action === 'delete_item') {
        if (entry.payload.remoteId) {
          await pb.collection('practice_items').delete(entry.payload.remoteId);
        }
      } else if (entry.action === 'rename_item') {
        if (entry.payload.remoteId) {
          await pb.collection('practice_items').update(entry.payload.remoteId, {
            name: entry.payload.newName,
          });
        }
      }
      await db.syncQueue.delete(entry.id);
    } catch (err) {
      console.error('Sync queue flush failed for entry:', entry, err);
      break; // Stop on first failure, retry later
    }
  }
}

// --- Pull remote data into Dexie (initial sync) ---

export async function pullAll(userId) {
  // Pull items
  const remoteItems = await pb.collection('practice_items').getFullList({
    filter: pb.filter('user = {:userId}', { userId }),
    sort: 'created',
  });

  for (const remote of remoteItems) {
    const existing = await db.practiceItems
      .where('remoteId').equals(remote.id).first();
    if (existing) {
      await db.practiceItems.update(existing.id, { name: remote.name });
    } else {
      await db.practiceItems.add({
        name: remote.name,
        remoteId: remote.id,
      });
    }
  }

  // Pull logs
  const remoteLogs = await pb.collection('practice_logs').getFullList({
    filter: pb.filter('user = {:userId}', { userId }),
  });

  for (const remote of remoteLogs) {
    const existing = await db.practiceLogs
      .where('remoteId').equals(remote.id).first();
    if (!existing) {
      // Find local item by remote ID
      const localItem = await db.practiceItems
        .where('remoteId').equals(remote.item).first();
      if (localItem) {
        await db.practiceLogs.add({
          itemId: localItem.id,
          date: remote.date,
          duration: remote.duration,
          remoteId: remote.id,
        });
      }
    }
  }
}

// --- Real-time subscriptions ---

export function subscribeToChanges(userId, onDataChanged) {
  // Subscribe to practice_items changes
  pb.collection('practice_items').subscribe('*', async (e) => {
    if (e.action === 'create') {
      const existing = await db.practiceItems
        .where('remoteId').equals(e.record.id).first();
      if (!existing) {
        await db.practiceItems.add({
          name: e.record.name,
          remoteId: e.record.id,
        });
        onDataChanged();
      }
    } else if (e.action === 'update') {
      const existing = await db.practiceItems
        .where('remoteId').equals(e.record.id).first();
      if (existing) {
        await db.practiceItems.update(existing.id, { name: e.record.name });
        onDataChanged();
      }
    } else if (e.action === 'delete') {
      const existing = await db.practiceItems
        .where('remoteId').equals(e.record.id).first();
      if (existing) {
        await db.practiceLogs.where('itemId').equals(existing.id).delete();
        await db.practiceItems.delete(existing.id);
        onDataChanged();
      }
    }
  });

  // Subscribe to practice_logs changes
  pb.collection('practice_logs').subscribe('*', async (e) => {
    if (e.action === 'create') {
      const existing = await db.practiceLogs
        .where('remoteId').equals(e.record.id).first();
      if (!existing) {
        const localItem = await db.practiceItems
          .where('remoteId').equals(e.record.item).first();
        if (localItem) {
          await db.practiceLogs.add({
            itemId: localItem.id,
            date: e.record.date,
            duration: e.record.duration,
            remoteId: e.record.id,
          });
          onDataChanged();
        }
      }
    } else if (e.action === 'delete') {
      const existing = await db.practiceLogs
        .where('remoteId').equals(e.record.id).first();
      if (existing) {
        await db.practiceLogs.delete(existing.id);
        onDataChanged();
      }
    }
  });

  return () => {
    pb.collection('practice_items').unsubscribe();
    pb.collection('practice_logs').unsubscribe();
  };
}
```

### 6.3 Updated `database.js`

The existing database.js **stays mostly the same** (still reads/writes Dexie). We add the `remoteId` field and `syncQueue` table:

```javascript
import Dexie from 'dexie';
import { getTodayString } from '../utils/dateHelpers';

export const db = new Dexie('DrummateDB');

db.version(3).stores({
  practiceItems: '++id, name, remoteId',
  practiceLogs: '++id, itemId, date, duration, remoteId',
  syncQueue: '++id, action, collection, localId',
});

// --- Practice Items (unchanged API) ---

export const getItems = async () => {
  return await db.practiceItems.toArray();
};

export const addItem = async (name) => {
  return await db.practiceItems.add({ name });
};

export const renameItem = async (id, newName) => {
  return await db.practiceItems.update(id, { name: newName });
};

export const deleteItem = async (id) => {
  await db.practiceLogs.where('itemId').equals(id).delete();
  return await db.practiceItems.delete(id);
};

// --- Practice Logs (unchanged API) ---

export const addLog = async (itemId, duration, date) => {
  if (!date) date = getTodayString();
  return await db.practiceLogs.add({ itemId, date, duration });
};

export const getTodaysLogs = async () => {
  const today = getTodayString();
  return await db.practiceLogs.where('date').equals(today).toArray();
};

export const getLogsByDate = async (dateString) => {
  return await db.practiceLogs.where('date').equals(dateString).toArray();
};
```

> **Key insight:** The 7 database functions keep their exact same signatures. `App.jsx` doesn't need to change how it calls them. The sync layer works alongside, not replacing the local operations.

### 6.4 Hooking Sync into App.jsx

```javascript
import { useAuth } from './contexts/AuthContext';
import { pushItem, pushLog, pullAll, flushSyncQueue, subscribeToChanges } from './services/sync';

// After each local write, push to PocketBase:
const handleAddItem = useCallback(async (name) => {
  const localId = await addItem(name);
  await loadData();
  if (user) {
    const item = await db.practiceItems.get(localId);
    pushItem(item, user.id); // fire-and-forget, non-blocking
  }
}, [loadData, user]);

// On sign-in, do initial sync:
useEffect(() => {
  if (!user) return;

  const init = async () => {
    await flushSyncQueue(user.id);
    await pullAll(user.id);
    await loadData(); // Refresh UI with synced data
  };
  init();

  // Subscribe to real-time changes from other devices
  const unsubscribe = subscribeToChanges(user.id, loadData);
  return unsubscribe;
}, [user, loadData]);
```

---

## Phase 7: Migration from Existing Dexie Data

Users who already have data in Dexie need their existing records synced to PocketBase on first sign-in.

### 7.1 Migration Flow

```
User signs in for the first time
  → pullAll() pulls remote data (empty for new user)
  → Check local Dexie for items/logs without remoteId
  → Push each unsynced item to PocketBase
  → Push each unsynced log to PocketBase
  → All records now have remoteId set
```

This happens naturally — `pullAll()` + `flushSyncQueue()` on sign-in handles it. We just need to push existing local records that have no `remoteId`:

```javascript
export async function pushAllUnsynced(userId) {
  // Push items without remoteId
  const unsyncedItems = await db.practiceItems
    .filter(item => !item.remoteId).toArray();
  for (const item of unsyncedItems) {
    await pushItem(item, userId);
  }

  // Push logs without remoteId
  const unsyncedLogs = await db.practiceLogs
    .filter(log => !log.remoteId).toArray();
  for (const log of unsyncedLogs) {
    await pushLog(log, userId);
  }
}
```

Add to the sign-in flow:
```javascript
await flushSyncQueue(user.id);
await pushAllUnsynced(user.id);  // Migrate existing local data
await pullAll(user.id);
```

---

## Phase 8: UI Changes

### 8.1 New Components

| Component | Purpose |
|---|---|
| `AuthScreen.jsx` | Email/password sign-in and sign-up |

### 8.2 Modified Components

| Component | Change |
|---|---|
| `App.jsx` | Auth gate, sign-out button, sync hooks |
| `main.jsx` | Wrap with `AuthProvider` |

### 8.3 Translation Keys

```javascript
// English
auth: {
  signIn: 'Sign In',
  signUp: 'Sign Up',
  signOut: 'Sign Out',
  email: 'Email',
  password: 'Password',
  name: 'Display Name',
  noAccount: "Don't have an account?",
  hasAccount: 'Already have an account?',
  syncing: 'Syncing...',
}

// Chinese
auth: {
  signIn: '登录',
  signUp: '注册',
  signOut: '退出',
  email: '邮箱',
  password: '密码',
  name: '显示名称',
  noAccount: '没有账号？',
  hasAccount: '已有账号？',
  syncing: '同步中...',
}
```

---

## Phase 9: Dependency Changes

### Add
```
pocketbase    # PocketBase JS SDK (14 KB gzip, zero dependencies)
```

### Keep
```
dexie         # Still the local database (offline-first)
```

### Bundle Size Impact

| Package | Size (gzipped) |
|---|---|
| `pocketbase` | ~14 KB |
| `dexie` (kept) | 12 KB |
| **Net increase** | **~14 KB** |

> Compare: Firebase would have added ~70 KB. PocketBase is 5x lighter.

---

## Phase 10: Implementation Order

| Step | Task | Files |
|---|---|---|
| 1 | Deploy PocketBase to AWS EC2 t4g.small (Singapore) | AWS console setup (server-side) |
| 2 | Create collections + API rules in PocketBase admin | PocketBase admin UI |
| 3 | Install `pocketbase` SDK, create config | `package.json`, `src/services/pocketbase.js`, `.env` |
| 4 | Create `AuthContext.jsx` | `src/contexts/AuthContext.jsx` |
| 5 | Create `AuthScreen.jsx` | `src/components/AuthScreen.jsx` |
| 6 | Wire auth into app: `AuthProvider` in `main.jsx`, auth gate in `App.jsx` | `src/main.jsx`, `src/App.jsx` |
| 7 | Upgrade Dexie schema to v3 (add `remoteId`, `syncQueue`) | `src/services/database.js` |
| 8 | Create sync service | `src/services/sync.js` |
| 9 | Hook sync into `App.jsx` (push after writes, pull on sign-in, real-time subs) | `src/App.jsx` |
| 10 | Add sign-out button to header | `src/App.jsx` |
| 11 | Add auth translation keys | `src/contexts/LanguageContext.jsx` |
| 12 | Test: offline writes, cross-device sync, migration | Manual testing |

---

## Phase 11: Future Leaderboard

PocketBase supports **view collections** (read-only SQL views) — perfect for leaderboards:

### Leaderboard View Collection

```sql
-- PocketBase admin → Create Collection → Type: View
SELECT
  user,
  SUM(duration) as total_time,
  date as week_start
FROM practice_logs
WHERE date >= :weekStart
GROUP BY user
ORDER BY total_time DESC
```

Or use a regular collection + update on each log:

```javascript
// After addLog, update leaderboard entry
const weekStart = getWeekStart(); // Monday of current week
const entryId = `${userId}_${weekStart}`;

try {
  const existing = await pb.collection('leaderboard').getOne(entryId);
  await pb.collection('leaderboard').update(entryId, {
    totalTime: existing.totalTime + duration,
  });
} catch {
  await pb.collection('leaderboard').create({
    id: entryId,
    user: userId,
    weekStart,
    totalTime: duration,
  });
}
```

Query top 10:
```javascript
const top10 = await pb.collection('leaderboard').getList(1, 10, {
  filter: pb.filter('weekStart = {:week}', { week: currentWeekStart }),
  sort: '-totalTime',
  expand: 'user',
});
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| PocketBase is single-developer project | Open source, can self-maintain fork if abandoned; data is just SQLite |
| AWS Singapore latency from China | ~50-80ms is acceptable for async sync; local Dexie keeps UI instant |
| Sync conflicts (same record edited on two devices) | Last-write-wins; for a practice tracker, conflicts are near-impossible (no collaborative editing) |
| T4g free trial ends (Jan 2027) | Downgrade to t4g.micro (~$3/mo) or t4g.nano (~$1.50/mo); PocketBase only needs ~15MB RAM |
| SSE disconnects | PocketBase SDK auto-reconnects; idle timeout is harmless |
| Migration loses data | Dexie data is never deleted; unsynced records retry on next sign-in |

---

## Comparison: This Plan vs Firebase Plan

| | **Firebase (old plan)** | **PocketBase (this plan)** |
|--|--|--|
| **Works in China** | No | **Yes** (Singapore server) |
| **Offline support** | Built-in (Firestore cache) | Dexie.js (already exists) |
| **Bundle size increase** | +70 KB | **+14 KB** |
| **Hosting cost** | Free | **$0** (AWS T4g free trial through Dec 2026, then ~$3/mo) |
| **Auth** | Google + email | Email only (Google blocked in China) |
| **database.js changes** | Full rewrite (new API) | **Minimal** (add remoteId field) |
| **App.jsx changes** | All DB calls get userId param | Add sync hooks only |
| **Vendor lock-in** | High (Google) | **None** (self-hosted, SQLite) |
| **Real-time sync** | onSnapshot listeners | SSE subscriptions |
| **Complexity** | Lower (Firebase handles sync) | Higher (custom sync layer) |

---

## Checklist Before Shipping

- [ ] PocketBase deployed on AWS EC2 Singapore and accessible from China (test with Chinese IP/VPN)
- [ ] API rules locked down (users only see own data)
- [ ] Offline writes work (airplane mode → practice → reconnect → synced)
- [ ] Cross-device sync works (log on phone → appears on laptop)
- [ ] Existing Dexie data migrates on first sign-in
- [ ] Auth flow works (sign up, sign in, sign out)
- [ ] `npm run build` passes
- [ ] All three tabs work (Practice, Metronome, Report)
- [ ] Language toggle works on AuthScreen
- [ ] PWA install still works
- [ ] Sync doesn't block UI (all remote calls are fire-and-forget)

---

*Last updated: 2026-02-18*
