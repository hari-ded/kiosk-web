import { createContext, useContext } from 'react';

export const SupportContext = createContext<(() => void) | undefined>(undefined);

export function useSupport() {
  return useContext(SupportContext);
}
