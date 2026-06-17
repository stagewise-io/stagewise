import type * as Monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FilePreviewResult } from '@shared/karton-contracts/ui';
import { FILE_SAVE_CONFLICT_CODE } from '@shared/karton-contracts/ui';
import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import {
  clearFileTabUnsavedEditEntry,
  setFileTabUnsavedEditEntry,
} from './file-tab-unsaved-edits';

/**
 * The save / undo / redo / conflict surface a file-editing tab exposes to the
 * toolbar and the external-change banner. Implemented identically by the plain
 * source editor and the diff editor via {@link useFileEditorController}.
 */
export type EditorActions = {
  save: () => void;
  forceSave: () => void;
  reload: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isSaving: boolean;
  readOnly: boolean;
  externalChange: boolean;
};

/** Signature of `fileTree.saveFile`, threaded in so the hook stays UI-only. */
type SaveFileProcedure = (
  workspaceKey: string,
  relativePath: string,
  text: string,
  expectedMtimeMs?: number | null,
) => Promise<FilePreviewResult | null>;

/** Outcome of reconciling the editor against fresh on-disk content. */
export type DiskReconcileOutcome = 'unchanged' | 'adopted' | 'conflict';

/** Fresh on-disk baseline (text + mtime) after a reload/fetch. */
export type DiskBaseline = { text: string; mtimeMs: number | null };

export interface FileEditorControllerOptions {
  tabId: string;
  workspaceKey: string;
  relativePath: string;
  readOnly: boolean;
  saveFile: SaveFileProcedure;
  /**
   * On-disk baseline the editor is first loaded with. Seeded once into the
   * baseline refs so the initial reconcile/save isn't treated as a conflict.
   * Omit when the content loads asynchronously and call {@link setBaseline}
   * once it arrives instead.
   */
  initialText?: string;
  initialMtimeMs?: number | null;
  /** The editable text model (modified side for diffs) for undo/redo state. */
  getModel: () => Monaco.editor.ITextModel | null | undefined;
  /** Current editor text to persist / diff against the baseline. */
  getValue: () => string | null | undefined;
  /**
   * Discard local edits and load the freshest on-disk content into the editor.
   * Implementations apply the content themselves and return the new baseline;
   * the controller resets dirty/conflict state and updates its baseline refs.
   */
  reload: () => Promise<DiskBaseline | null>;
  /** Title shown in the unsaved-edits close prompt. */
  unsavedTitle: string;
  /** Discard handler invoked from the unsaved-edits close prompt. */
  onDiscard?: () => void;
  /** Invoked after a successful save (e.g. to update caches). */
  onSaved?: (result: FilePreviewResult | null, nextText: string) => void;
  /**
   * Invoked on a non-conflict save failure. When omitted the error is
   * re-thrown (matching the plain editor's original behavior); when provided
   * (the diff editor) the error is surfaced inline instead.
   */
  onSaveError?: (error: unknown) => void;
}

/**
 * Shared editing controller for file tabs. Centralizes the dirty/undo/redo
 * tracking, optimistic-concurrency save (with {@link FILE_SAVE_CONFLICT_CODE}
 * handling), live external-change reconciliation, unsaved-edit close prompt,
 * and the Save/Undo/Redo hotkeys — so the plain source editor and the diff
 * editor behave identically without duplicating the logic.
 */
export function useFileEditorController(options: FileEditorControllerOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { readOnly } = options;

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [externalChange, setExternalChange] = useState(false);

  // Mirror save/conflict flags into refs so the stable callbacks below can read
  // the latest value without being re-created (which would re-bind hotkeys).
  const isSavingRef = useRef(false);
  const externalChangeRef = useRef(false);
  externalChangeRef.current = externalChange;

  // Baseline the editor content is measured against. `savedText` drives dirty
  // detection; `baselineMtime` is the optimistic-concurrency token for saves;
  // `lastDiskText` is the most recent on-disk content the controller has seen
  // (used to ignore metadata-only touches and our own writes).
  const savedTextRef = useRef(options.initialText ?? '');
  const baselineMtimeRef = useRef<number | null | undefined>(
    options.initialMtimeMs,
  );
  const lastDiskTextRef = useRef(options.initialText ?? '');

  const setBaseline = useCallback((text: string, mtimeMs: number | null) => {
    savedTextRef.current = text;
    lastDiskTextRef.current = text;
    baselineMtimeRef.current = mtimeMs;
  }, []);

  const refreshState = useCallback(() => {
    const { getModel, getValue } = optionsRef.current;
    const model = getModel();
    setCanUndo(Boolean(model?.canUndo()));
    setCanRedo(Boolean(model?.canRedo()));
    const value = getValue();
    if (value != null) setIsDirty(value !== savedTextRef.current);
  }, []);

  const save = useCallback(
    async (force = false): Promise<boolean> => {
      const {
        readOnly: ro,
        getValue,
        saveFile,
        workspaceKey,
        relativePath,
        tabId,
        onSaved,
        onSaveError,
      } = optionsRef.current;
      const nextText = getValue();
      if (ro || nextText == null || isSavingRef.current) return false;
      isSavingRef.current = true;
      setIsSaving(true);
      try {
        const result = await saveFile(
          workspaceKey,
          relativePath,
          nextText,
          force ? null : baselineMtimeRef.current,
        );
        // Record the just-written content as the new baseline so the directory
        // revision bump our own write triggers isn't seen as an external edit.
        savedTextRef.current = nextText;
        lastDiskTextRef.current = nextText;
        baselineMtimeRef.current = result?.mtimeMs ?? null;
        setIsDirty(false);
        setExternalChange(false);
        clearFileTabUnsavedEditEntry(tabId);
        onSaved?.(result, nextText);
        return true;
      } catch (err) {
        // The backend rejected the save because the file changed on disk since
        // it was loaded — surface the conflict instead of overwriting blindly.
        if (
          err instanceof Error &&
          err.message.includes(FILE_SAVE_CONFLICT_CODE)
        ) {
          setExternalChange(true);
          return false;
        }
        if (onSaveError) {
          onSaveError(err);
          return false;
        }
        throw err;
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
        refreshState();
      }
    },
    [refreshState],
  );

  // While an external-change conflict is surfaced the plain save is blocked;
  // the user must explicitly Reload or Overwrite from the banner.
  const handleSave = useCallback(() => {
    if (externalChangeRef.current) return;
    void save(false);
  }, [save]);

  const forceSave = useCallback(() => {
    void save(true);
  }, [save]);

  const reload = useCallback(async () => {
    const baseline = await optionsRef.current.reload();
    if (!baseline) {
      // Reload failed (e.g. a transient fetch error). Keep the current edits,
      // dirty/conflict flags and the unsaved-edits close prompt intact so the
      // user's work isn't silently discarded — they can retry the reload.
      window.setTimeout(refreshState, 0);
      return;
    }
    setBaseline(baseline.text, baseline.mtimeMs);
    setExternalChange(false);
    setIsDirty(false);
    clearFileTabUnsavedEditEntry(optionsRef.current.tabId);
    window.setTimeout(refreshState, 0);
  }, [refreshState, setBaseline]);

  const undo = useCallback(() => {
    const model = optionsRef.current.getModel();
    if (!model?.canUndo()) return;
    void model.undo();
    window.setTimeout(refreshState, 0);
  }, [refreshState]);

  const redo = useCallback(() => {
    const model = optionsRef.current.getModel();
    if (!model?.canRedo()) return;
    void model.redo();
    window.setTimeout(refreshState, 0);
  }, [refreshState]);

  /**
   * Reconcile the editor against freshly-read on-disk content. With no local
   * edits the new content is adopted as the baseline (caller pushes it into the
   * editor on `'adopted'`); with unsaved edits a conflict is raised so the user
   * is warned before losing work.
   */
  const reconcileDisk = useCallback(
    (diskText: string, mtimeMs: number | null): DiskReconcileOutcome => {
      if (optionsRef.current.readOnly) return 'unchanged';
      if (diskText === lastDiskTextRef.current) {
        // Content unchanged (e.g. a metadata-only touch) — refresh the mtime
        // baseline so the next save isn't flagged as a false conflict.
        baselineMtimeRef.current = mtimeMs;
        return 'unchanged';
      }
      lastDiskTextRef.current = diskText;
      const value = optionsRef.current.getValue() ?? savedTextRef.current;
      const userHasEdits = value !== savedTextRef.current;
      if (userHasEdits) {
        setExternalChange(true);
        return 'conflict';
      }
      savedTextRef.current = diskText;
      baselineMtimeRef.current = mtimeMs;
      setExternalChange(false);
      setIsDirty(false);
      clearFileTabUnsavedEditEntry(optionsRef.current.tabId);
      return 'adopted';
    },
    [],
  );

  /**
   * Recompute dirty/undo/redo state after an editor content change and
   * register (or clear) the unsaved-edits close prompt accordingly.
   */
  const notifyContentChanged = useCallback(() => {
    const {
      getValue,
      readOnly: ro,
      tabId,
      unsavedTitle,
      workspaceKey,
      relativePath,
      onDiscard,
    } = optionsRef.current;
    const value = getValue();
    const nextDirty = value != null && value !== savedTextRef.current;
    setIsDirty(nextDirty);
    if (nextDirty && !ro) {
      setFileTabUnsavedEditEntry({
        tabId,
        title: unsavedTitle,
        workspaceKey,
        relativePath,
        save: () => save(false),
        discard: () => {
          onDiscard?.();
          clearFileTabUnsavedEditEntry(tabId);
        },
      });
    } else {
      clearFileTabUnsavedEditEntry(tabId);
    }
    window.setTimeout(refreshState, 0);
  }, [save, refreshState]);

  // Clear any lingering unsaved-edit prompt when the tab unmounts.
  useEffect(() => {
    const { tabId } = optionsRef.current;
    return () => clearFileTabUnsavedEditEntry(tabId);
  }, []);

  useHotKeyListener(handleSave, HotkeyActions.SAVE_FILE);
  useHotKeyListener(undo, HotkeyActions.UNDO_FILE_EDIT);
  useHotKeyListener(redo, HotkeyActions.REDO_FILE_EDIT);

  const actions = useMemo<EditorActions>(
    () => ({
      save: () => handleSave(),
      forceSave,
      reload: () => void reload(),
      undo,
      redo,
      canUndo,
      canRedo,
      isDirty,
      isSaving,
      readOnly,
      externalChange,
    }),
    [
      handleSave,
      forceSave,
      reload,
      undo,
      redo,
      canUndo,
      canRedo,
      isDirty,
      isSaving,
      readOnly,
      externalChange,
    ],
  );

  return {
    actions,
    save,
    handleSave,
    forceSave,
    reload,
    undo,
    redo,
    refreshState,
    reconcileDisk,
    notifyContentChanged,
    setBaseline,
  };
}
