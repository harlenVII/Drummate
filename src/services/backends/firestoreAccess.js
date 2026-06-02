// Single indirection point for Firestore SDK access so tests can inject a fake.
// Production code uses the real SDK; tests call setFirestoreImpl() with a fake.
import {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase';

let impl = {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
  getDb: () => getFirebaseApp().db,
};

export function getFirestore() {
  return impl;
}

// Test-only: replace the Firestore implementation. Pass no arg to reset.
export function setFirestoreImpl(next) {
  impl = next ?? impl;
}
