// Single indirection point for Firestore SDK access so tests can inject a fake.
// Production code uses the real SDK; tests call setFirestoreImpl() with a fake.
import {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase';

const realImpl = {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
  getDb: () => getFirebaseApp().db,
};

let impl = realImpl;

export function getFirestore() {
  return impl;
}

// Test-only: replace the Firestore implementation. Pass no arg to reset to the real SDK.
export function setFirestoreImpl(next) {
  impl = next ?? realImpl;
}
