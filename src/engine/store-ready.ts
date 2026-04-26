// Runtime guards for ReadyStore (a GameStore where player + world are populated).
// Kept separate from types.ts so that file stays pure type definitions.

import type { GameStore, ReadyStore } from './types';

export function isReady(store: GameStore): store is ReadyStore {
  return store.player !== null && store.world !== null;
}

/**
 * Throws if the store is not in a gameplay state. Use at engine-internal
 * entry points where reaching the call without player/world populated is a
 * programmer error, not a runtime expectation.
 */
export function assertReady(store: GameStore): asserts store is ReadyStore {
  if (store.player === null || store.world === null) {
    throw new Error('assertReady: store has no player/world (called outside a gameplay state?)');
  }
}
