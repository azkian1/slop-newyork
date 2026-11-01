// Where new drawings are published. The game repo is not the write target.
export const DROPS_REMOTE_URL = 'https://raw.githubusercontent.com/azkian1/slop-newyork-drops/main/drops.json';

export const DROPS_POLL_MS = 3 * 60 * 1000;
export const DROPS_FOCUS_MS = 30 * 1000;
export const DROPS_FETCH_TIMEOUT_MS = 4000;

// hidden tabs do not poll. Focus refetches sooner than the interval, but not on every event.
export function pollDue(lastAt, now, hidden, reason) {
  if (hidden) return false;
  const wait = reason === 'focus' ? DROPS_FOCUS_MS : DROPS_POLL_MS;
  return !Number.isFinite(lastAt) || now - lastAt >= wait;
}
