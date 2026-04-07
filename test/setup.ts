import { beforeEach } from 'vitest';

// In-memory localStorage polyfill so save.ts works in node environment.
// The Storage DOM interface carries a `[name: string]: any` index signature, so
// MemoryStorage mirrors that shape to satisfy structural typing.
class MemoryStorage implements Storage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches lib.dom Storage
  [name: string]: any;
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const globalWithStorage = globalThis as unknown as { localStorage: Storage };
globalWithStorage.localStorage = new MemoryStorage();

beforeEach(() => {
  globalWithStorage.localStorage.clear();
});
