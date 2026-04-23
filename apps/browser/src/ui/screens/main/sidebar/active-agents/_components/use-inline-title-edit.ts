import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInlineTitleEditArgs {
  /** Current title value (source of truth while not editing). */
  title: string;
  /** Called with the validated, trimmed new title when the user commits. */
  onCommit: (newTitle: string) => void;
}

export interface UseInlineTitleEditReturn {
  isEditing: boolean;
  titleRef: React.RefObject<HTMLSpanElement | null>;
  /**
   * What consumers should render for the title. Equals `title` normally, or
   * the optimistic pending value during the commit → Karton-echo window so
   * the UI doesn't briefly flash back to the old title between the editable
   * span unmounting and the parent's `title` prop catching up.
   */
  displayTitle: string;
  startEditing: () => void;
  commitEdit: () => void;
  cancelEdit: () => void;
}

/**
 * Shared logic for a click-to-edit inline title backed by a `contentEditable`
 * `<span>`. Handles focus/select-all on entering edit mode, syncing the
 * external `title` prop into the DOM while not editing, validation
 * (2–80 chars, trimmed, must differ), and commit/cancel callbacks.
 *
 * Used by both the AgentCard and the AgentsSelector row.
 */
export function useInlineTitleEdit({
  title,
  onCommit,
}: UseInlineTitleEditArgs): UseInlineTitleEditReturn {
  const [isEditing, setIsEditing] = useState(false);
  // Optimistic value shown between commit and the next `title` prop echo.
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  // One-shot guard: both consumers wire Enter AND onBlur to commitEdit, and a
  // programmatic commit on Enter triggers an implicit blur as the editable
  // span unmounts. Without this flag the same rename would fire onCommit
  // twice — two RPCs, two Karton fan-outs, two exception captures on failure.
  const committedRef = useRef(false);

  // Clear the pending title once the parent's authoritative title matches it
  // (Karton state caught up). After this point `displayTitle` falls back to
  // the prop naturally and we stop lying about the source of truth.
  useEffect(() => {
    if (pendingTitle !== null && title === pendingTitle) {
      setPendingTitle(null);
    }
  }, [title, pendingTitle]);

  // Safety net: if the RPC fails silently and `title` never echoes back,
  // drop the optimistic value after 3s so the UI doesn't lie indefinitely.
  useEffect(() => {
    if (pendingTitle === null) return;
    const t = setTimeout(() => setPendingTitle(null), 3000);
    return () => clearTimeout(t);
  }, [pendingTitle]);

  const displayTitle = pendingTitle ?? title;

  // When entering edit mode, focus the span and select all text.
  //
  // Defer to the next animation frame so we run AFTER any focus-restoration
  // effects from parent focus-traps (e.g. base-ui Combobox keeps its Input
  // focused by default; without the rAF we lose focus after one frame).
  useEffect(() => {
    if (!isEditing) return;
    const raf = requestAnimationFrame(() => {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditing]);

  // Sync the displayed title into the DOM when not editing (e.g. backend
  // auto-title, or the optimistic value after commit). Uses `displayTitle`
  // so any future consumer that keeps the span mounted stays consistent
  // with what we render.
  useEffect(() => {
    if (!isEditing && titleRef.current) {
      titleRef.current.textContent = displayTitle;
    }
  }, [displayTitle, isEditing]);

  const commitEdit = useCallback(() => {
    if (!titleRef.current) return;
    // Idempotent: subsequent calls in the same edit session are no-ops.
    if (committedRef.current) return;
    const newTitle = (titleRef.current.textContent ?? '').trim();
    setIsEditing(false);

    // Validate: 2–80 chars, and actually different
    if (newTitle.length >= 2 && newTitle.length <= 80 && newTitle !== title) {
      committedRef.current = true;
      // Optimistically show the new title until the parent's prop catches up.
      setPendingTitle(newTitle);
      onCommit(newTitle);
    } else {
      titleRef.current.textContent = title;
    }
  }, [title, onCommit]);

  const cancelEdit = useCallback(() => {
    if (titleRef.current) {
      titleRef.current.textContent = title;
    }
    committedRef.current = false;
    setIsEditing(false);
  }, [title]);

  const startEditing = useCallback(() => {
    committedRef.current = false;
    setIsEditing(true);
  }, []);

  return {
    isEditing,
    titleRef,
    displayTitle,
    startEditing,
    commitEdit,
    cancelEdit,
  };
}
