import { beforeEach } from 'vitest';

// In-memory localStorage polyfill so save.ts works in node environment.
class MemoryStorage implements Storage {
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

(globalThis as any).localStorage = new MemoryStorage();

beforeEach(() => {
  (globalThis as any).localStorage.clear();
});
