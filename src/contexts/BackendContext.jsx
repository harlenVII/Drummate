import { createContext, useContext } from 'react';
import firebaseBackend from '../services/backends/firebaseBackend';

const BackendContext = createContext(firebaseBackend);

/** @param {{ backend?: import('../services/backends/backendInterface').Backend, children: React.ReactNode }} props */
export function BackendProvider({ backend = firebaseBackend, children }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

export function useBackend() {
  return useContext(BackendContext);
}
