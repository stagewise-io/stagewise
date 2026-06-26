/**
 * Priority levels for CMD+Enter targets.
 * Lower number = higher priority (wins over higher numbers).
 * On equal priority, the target registered first wins (seq tiebreaker).
 */
export enum CmdEnterPriority {
  USER_QUESTION = 10,
  SHELL_APPROVAL = 20,
  CREATE_PLAN = 30,
  ERROR_RETRY = 40,
  PLAN_SECTION = 50,
  FILE_DIFF_ACCEPT = 60,
}

export interface CmdEnterTarget {
  id: string;
  priority: number;
  action: () => void;
  element: HTMLElement;
}

interface InternalTarget extends CmdEnterTarget {
  isVisible: boolean;
  seq: number;
}

/**
 * Module-level singleton registry that tracks CMD+Enter-eligible buttons
 * across both the virtualized chat history tree and the footer status card.
 *
 * Uses an IntersectionObserver for viewport visibility tracking and
 * `useSyncExternalStore` (via the hook) for badge display — no React
 * Context, no prop drilling, no tree-wide re-renders.
 *
 * Registration is O(1). Winner computation is O(n) where n is typically
 * 1–3 registered targets.
 */
class CmdEnterRegistry {
  private targets = new Map<string, InternalTarget>();
  private winnerId: string | null = null;
  private listeners = new Set<() => void>();
  private seqCounter = 0;

  private _observer: IntersectionObserver | null = null;

  private get observer(): IntersectionObserver {
    if (this._observer === null) {
      this._observer = new IntersectionObserver(
        (entries) => {
          let changed = false;
          for (const entry of entries) {
            const id = entry.target.getAttribute('data-cmd-enter-id');
            if (!id) continue;
            const target = this.targets.get(id);
            if (!target) continue;
            const wasVisible = target.isVisible;
            target.isVisible = entry.isIntersecting;
            if (wasVisible !== entry.isIntersecting) changed = true;
          }
          if (changed) this.recalculate();
        },
        { threshold: 0 },
      );
    }
    return this._observer;
  }

  /** Register a target. Returns an unregister function. */
  register(target: CmdEnterTarget): () => void {
    // Guard: if a target with this id is already registered, unregister it
    // first to prevent IntersectionObserver leaks from stale elements.
    if (this.targets.has(target.id)) {
      this.unregister(target.id);
    }
    // Seed visibility from the element's current geometric state so the
    // first recalculate can select an immediately visible target without
    // waiting for the async IntersectionObserver callback.
    const rect = target.element.getBoundingClientRect();
    const isVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < window.innerHeight &&
      rect.bottom > 0;
    const internal: InternalTarget = {
      ...target,
      isVisible,
      seq: this.seqCounter++,
    };
    target.element.setAttribute('data-cmd-enter-id', target.id);
    this.targets.set(target.id, internal);
    this.observer.observe(target.element);
    this.recalculate();
    return () => this.unregister(target.id);
  }

  unregister(id: string): void {
    const target = this.targets.get(id);
    if (!target) return;
    this.observer.unobserve(target.element);
    target.element.removeAttribute('data-cmd-enter-id');
    this.targets.delete(id);
    this.recalculate();
  }

  /** Update a target's priority in-place (no re-observation). */
  update(id: string, updates: { priority?: number }): void {
    const target = this.targets.get(id);
    if (!target) return;
    if (updates.priority !== undefined) target.priority = updates.priority;
    this.recalculate();
  }

  /**
   * Synchronously compute the current winner: the visible target with
   * the lowest (priority, seq) tuple.
   */
  private computeWinner(): InternalTarget | null {
    let best: InternalTarget | null = null;
    for (const target of Array.from(this.targets.values())) {
      if (!target.isVisible) continue;
      if (
        !best ||
        target.priority < best.priority ||
        (target.priority === best.priority && target.seq < best.seq)
      ) {
        best = target;
      }
    }
    return best;
  }

  /** Recalculate winner and notify subscribers if it changed. */
  private recalculate(): void {
    const winner = this.computeWinner();
    const newWinnerId = winner?.id ?? null;
    if (newWinnerId === this.winnerId) return;
    this.winnerId = newWinnerId;
    Array.from(this.listeners).forEach((listener) => listener());
  }

  /** Get the current winner (for the keydown dispatcher). */
  getWinner(): CmdEnterTarget | null {
    return this.computeWinner();
  }

  // Stable arrow-function properties for useSyncExternalStore
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): string | null => {
    return this.winnerId;
  };
}

export const cmdEnterRegistry = new CmdEnterRegistry();
