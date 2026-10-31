// Small browser-storage wrapper. Safe in private windows where storage throws.
// In step 1b, settings move to the visitor's automatic Supabase account.
const PREFIX = 'cinenjoy:';

export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep going without it */
    }
  },
};
