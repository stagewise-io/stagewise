import type { TutorialDefinition } from './types';

/** Persisted tutorial progress: storage key → last seen step index. */
export type TutorialProgressState = Record<string, number>;

/**
 * Storage key for persisted progress. Version 1 uses the plain tutorial id
 * for backwards compatibility with already-persisted state; later versions
 * get a distinct key so stale step indices are discarded on version bumps.
 */
export function getTutorialStorageKey(
  def: Pick<TutorialDefinition, 'id' | 'version'>,
): string {
  return def.version <= 1 ? def.id : `${def.id}@v${def.version}`;
}

/** Last step index the user has seen, or -1 if never shown. */
export function getLastSeenStepIndex(
  def: Pick<TutorialDefinition, 'id' | 'version'>,
  state: TutorialProgressState,
): number {
  return state[getTutorialStorageKey(def)] ?? -1;
}

/** Whether the user has seen (or dismissed) all steps of a tutorial. */
export function isTutorialCompleted(
  def: Pick<TutorialDefinition, 'id' | 'version' | 'steps'>,
  state: TutorialProgressState,
): boolean {
  return getLastSeenStepIndex(def, state) >= def.steps.length - 1;
}

/**
 * Step index to start (or resume) a tutorial at. Prefers an explicitly
 * preserved index (tutorial was hidden mid-flight), otherwise resumes at
 * the first unseen step. Always clamped to valid step bounds.
 */
export function getTutorialStartIndex(
  def: Pick<TutorialDefinition, 'id' | 'version' | 'steps'>,
  state: TutorialProgressState,
  hiddenStepIndex?: number,
): number {
  const start = hiddenStepIndex ?? getLastSeenStepIndex(def, state) + 1;
  return Math.min(Math.max(start, 0), def.steps.length - 1);
}

/**
 * Insert a tutorial into the pending queue, deduplicated by id and ordered
 * by priority (lower first; ties keep insertion order). Returns a new array.
 */
export function insertQueuedTutorial(
  queue: readonly TutorialDefinition[],
  def: TutorialDefinition,
): TutorialDefinition[] {
  if (queue.some((d) => d.id === def.id)) return [...queue];
  const next = [...queue, def];
  // Array.prototype.sort is stable, so equal priorities keep insertion order.
  next.sort(
    (a, b) =>
      (a.priority ?? Number.MAX_SAFE_INTEGER) -
      (b.priority ?? Number.MAX_SAFE_INTEGER),
  );
  return next;
}

/**
 * Pop the next tutorial from the queue that is still eligible to show
 * (not dismissed this session, not already completed). Returns the next
 * tutorial (or null) and the remaining queue.
 */
export function takeNextEligibleTutorial(
  queue: readonly TutorialDefinition[],
  state: TutorialProgressState,
  sessionDismissedIds: ReadonlySet<string>,
): { next: TutorialDefinition | null; remaining: TutorialDefinition[] } {
  const remaining = [...queue];
  while (remaining.length > 0) {
    const candidate = remaining.shift();
    if (!candidate) break;
    if (sessionDismissedIds.has(candidate.id)) continue;
    if (isTutorialCompleted(candidate, state)) continue;
    return { next: candidate, remaining };
  }
  return { next: null, remaining };
}
