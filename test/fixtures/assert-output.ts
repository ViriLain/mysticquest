import { expect } from 'vitest';
import type { GameStore } from '../../src/engine/types';
import { flushTypewriter } from './mock-input';

/**
 * Get the last N lines of committed output (after flushing typewriter).
 */
export function lastLines(store: GameStore, n: number = 20): string[] {
  flushTypewriter(store);
  return store.lines.slice(-n).map(l => l.text);
}

/**
 * All lines committed so far (after flushing typewriter).
 */
export function allLines(store: GameStore): string[] {
  flushTypewriter(store);
  return store.lines.map(l => l.text);
}

/**
 * Assert that at least one line contains the given substring.
 */
export function expectLine(store: GameStore, substr: string): void {
  const lines = allLines(store);
  const found = lines.some(l => l.includes(substr));
  expect(found, `expected a line containing "${substr}". Last 10 lines:\n${lines.slice(-10).join('\n')}`).toBe(true);
}

/**
 * Assert that NO line contains the given substring.
 */
export function expectNoLine(store: GameStore, substr: string): void {
  const lines = allLines(store);
  const matched = lines.find(l => l.includes(substr));
  expect(matched, `expected no line containing "${substr}", but found: "${matched}"`).toBeUndefined();
}
