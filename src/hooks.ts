import { useSyncExternalStore } from 'react';
import { store } from './store';
import type { Snapshot } from './store';

export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export { store };
