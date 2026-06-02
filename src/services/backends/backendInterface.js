/**
 * @typedef {Object} Backend
 * @property {string} name
 * @property {(email: string, password: string) => Promise<object>} signIn
 * @property {(email: string, password: string, name: string) => Promise<object>} signUp
 * @property {() => void} signOut
 * @property {() => object|null} getUser
 * @property {(callback: (user: object|null) => void) => (() => void)} onAuthChange
 * @property {() => Promise<object>} refreshAuth
 * @property {() => boolean} isAbortError
 * @property {(err: any) => boolean} isNetworkError
 * @property {(localItem: object, userId: string) => Promise<void>} pushItem
 * @property {(localLog: object, userId: string) => Promise<void>} pushLog
 * @property {(localNote: object, userId: string) => Promise<void>} pushNote
 * @property {(noteUid: string, userId: string) => Promise<void>} deleteNoteRemote
 * @property {(localPractice: object, userId: string) => Promise<void>} pushPractice
 * @property {(localGoal: object, userId: string) => Promise<void>} pushGoal
 * @property {(goalUid: string, userId: string) => Promise<void>} deleteGoalRemote
 * @property {(uid: string, userId: string) => Promise<void>} pushDeletePractice
 * @property {(practices: object[], userId: string) => Promise<void>} pushPracticeReorder
 * @property {(uid: string, userId: string) => Promise<void>} pushDeleteItem
 * @property {(uid: string, newName: string, userId: string) => Promise<void>} pushRenameItem
 * @property {(items: object[], userId: string) => Promise<void>} pushReorder
 * @property {(uid: string, archived: boolean, userId: string) => Promise<void>} pushArchiveItem
 * @property {(uid: string, trashed: boolean, trashedAt: string, userId: string) => Promise<void>} pushTrashItem
 * @property {(uid: string, category: string, userId: string) => Promise<void>} pushSetCategory
 * @property {(sourceUid: string, targetUid: string, targetName: string, userId: string) => Promise<void>} mergeItems
 * @property {(userId: string) => Promise<object>} getUserSettings
 * @property {(userId: string, key: string, value: any) => Promise<void>} setUserSetting
 * @property {(userId: string) => Promise<void>} pullAll
 * @property {(userId: string) => Promise<void>} pullAllNotes
 * @property {(userId: string) => Promise<void>} pullAllPractices
 * @property {(userId: string) => Promise<void>} pullAllGoals
 * @property {(userId: string) => Promise<void>} pushAllLocal
 * @property {(userId: string) => Promise<void>} pushAllLocalNotes
 * @property {(userId: string) => Promise<void>} pushAllLocalPractices
 * @property {(userId: string) => Promise<void>} pushAllLocalGoals
 * @property {(userId: string) => Promise<void>} flushSyncQueue
 * @property {(onDataChanged: () => void) => (() => void)} subscribeToChanges
 */
export {};
