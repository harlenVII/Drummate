// In-memory Firestore double matching the surface firebaseBackend.js uses.
export function createFakeFirestore({ fromCache = false, fromCacheByPath = {} } = {}) {
  // store: Map<collectionPath, Map<docId, data>>
  const store = new Map();
  const listeners = []; // { path, cb }
  const pending = []; // every promise returned by a listener cb invocation

  const colPath = (segments) => segments.join('/');
  const getCol = (path) => {
    if (!store.has(path)) store.set(path, new Map());
    return store.get(path);
  };

  const resolveFromCache = (path) => fromCacheByPath[path] ?? fromCache;

  const makeSnap = (path) => {
    const col = getCol(path);
    const docs = [...col.entries()].map(([id, data]) => ({
      id,
      ref: { _path: path, _id: id },
      data: () => ({ ...data }),
    }));
    return {
      docs,
      metadata: { fromCache: resolveFromCache(path) },
      docChanges: () => docs.map((d) => ({ type: 'added', doc: d })),
    };
  };

  const impl = {
    getDb: () => ({}),
    collection: (_db, ...segments) => ({ _path: colPath(segments) }),
    doc: (colOrDb, ...rest) => {
      // doc(colRef, id) OR doc(db, ...segments)
      if (colOrDb && colOrDb._path) return { _path: colOrDb._path, _id: rest[0] };
      const segments = rest;
      const id = segments.pop();
      return { _path: colPath(segments), _id: id };
    },
    query: (colRef, ...constraints) => ({ ...colRef, _constraints: constraints }),
    where: (field, op, value) => ({ _where: [field, op, value] }),
    serverTimestamp: () => '__SERVER_TS__',
    getDocs: async (ref) => {
      const path = ref._path;
      const col = getCol(path);
      const wheres = (ref._constraints || []).filter((c) => c._where).map((c) => c._where);
      let entries = [...col.entries()];
      for (const [field, , value] of wheres) {
        entries = entries.filter(([, d]) => d[field] === value);
      }
      const docs = entries.map(([id, data]) => ({
        id, ref: { _path: path, _id: id }, data: () => ({ ...data }),
      }));
      return { docs, metadata: { fromCache: resolveFromCache(path) }, docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) };
    },
    getDoc: async (ref) => {
      const col = getCol(ref._path);
      const data = col.get(ref._id);
      return { exists: () => data !== undefined, data: () => ({ ...data }) };
    },
    setDoc: async (ref, data, opts) => {
      const col = getCol(ref._path);
      const prev = opts?.merge ? (col.get(ref._id) || {}) : {};
      col.set(ref._id, { ...prev, ...data });
    },
    updateDoc: async (ref, data) => {
      const col = getCol(ref._path);
      col.set(ref._id, { ...(col.get(ref._id) || {}), ...data });
    },
    deleteDoc: async (ref) => { getCol(ref._path).delete(ref._id); },
    onSnapshot: (ref, cb) => {
      const entry = { path: ref._path, cb };
      listeners.push(entry);
      pending.push(Promise.resolve(cb(makeSnap(ref._path)))); // initial snapshot, all 'added'
      return () => {
        const i = listeners.indexOf(entry);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
  };

  // Test helpers (not part of the SDK surface):
  impl.__seed = (path, id, data) => getCol(path).set(id, data);
  impl.__get = (path, id) => getCol(path).get(id);
  impl.__all = (path) => [...getCol(path).values()];
  impl.__emit = (path, changes) => {
    // changes: [{ type, id, data }]
    for (const { id, data } of changes) {
      if (data === undefined) getCol(path).delete(id);
      else getCol(path).set(id, data);
    }
    for (const l of listeners.filter((x) => x.path === path)) {
      const docs = changes.map((c) => ({
        type: c.type,
        doc: { id: c.id, ref: { _path: path, _id: c.id }, data: () => ({ ...c.data }) },
      }));
      pending.push(Promise.resolve(l.cb({ docs, metadata: { fromCache: resolveFromCache(path) }, docChanges: () => docs })));
    }
  };
  // Await every listener callback (initial snapshots + __emit) so tests can
  // deterministically drain the chained Dexie writes inside the async callbacks.
  // Drains iteratively because settling one callback may enqueue more.
  impl.__settle = async () => {
    while (pending.length) {
      const batch = pending.splice(0, pending.length);
      await Promise.allSettled(batch);
    }
  };

  return impl;
}
