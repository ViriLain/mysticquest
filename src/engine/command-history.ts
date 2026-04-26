// Persists the player's command history across sessions, so up-arrow recall
// survives a page reload. Stored as a single localStorage key (not per-slot —
// the same player on the same machine generally wants the same recall list).

const STORAGE_KEY = 'mysticquest_command_history';
const MAX_ENTRIES = 50;

export function loadCommandHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensively clamp size and skip non-string entries.
    return parsed.filter((s): s is string => typeof s === 'string').slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveCommandHistory(history: string[]): void {
  try {
    const trimmed = history.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable — recall just won't survive this session.
  }
}
