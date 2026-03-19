import { randomUUID } from 'node:crypto';

/**
 * A globally unique identifier for the current browser process lifetime.
 *
 * Generated once on first access and cached for the rest of the process.
 * When the app restarts, a new UUID is generated — agents can detect this
 * by comparing consecutive `browserSessionId` values in env snapshots and
 * treat it as a `browser-restarted` event.
 */
let sessionId: string | null = null;

export function getBrowserSessionId(): string {
  if (!sessionId) {
    sessionId = randomUUID();
  }
  return sessionId;
}
