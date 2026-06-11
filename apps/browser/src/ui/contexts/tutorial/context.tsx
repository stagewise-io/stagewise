import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import posthog from 'posthog-js';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import type { TutorialDefinition, TutorialStep } from './types';
import {
  getTutorialStorageKey,
  getTutorialStartIndex,
  insertQueuedTutorial,
  isTutorialCompleted,
  takeNextEligibleTutorial,
} from './tutorial-logic';

// Tutorials explicitly dismissed or completed in this app session.
// Module-level so a provider remount doesn't resurface them.
const sessionDismissedTutorialIds = new Set<string>();

interface TutorialContextValue {
  /** The currently active tutorial, or null if none is active */
  activeTutorial: TutorialDefinition | null;
  /** The currently displayed step, or null */
  currentStep: TutorialStep | null;
  /** Current step index within the active tutorial */
  currentStepIndex: number;
  /** Total steps in the active tutorial */
  totalSteps: number;
  /** Navigate to a specific step index */
  goToStep: (index: number) => void;
  /** Go to the next step */
  goNext: () => void;
  /** Go to the previous step */
  goBack: () => void;
  /**
   * Skip the current step without persisting progress. Used when a step's
   * target element cannot be found, so the user never gets steps marked as
   * seen that were never shown. Skipping past the last step hides the
   * tutorial (it stays eligible for a future session).
   */
  skipCurrentStep: () => void;
  /** Dismiss the current tutorial permanently (persists completion) */
  dismissTutorial: () => void;
  /** Hide the current tutorial without changing persisted progress */
  hideTutorial: () => void;
  /** Register a tutorial as available to show */
  registerTutorial: (def: TutorialDefinition) => void;
  /** Unregister a tutorial — removes it from the queue and hides if active */
  unregisterTutorial: (tutorialId: string) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return ctx;
}

export function TutorialProvider({ children }: { children?: ReactNode }) {
  const tutorialState = useKartonState(
    (s) => s.userExperience.storedExperienceData.tutorialState,
  );
  const setTutorialStep = useKartonProcedure(
    (p) => p.userExperience.tutorial.setStep,
  );

  const [activeTutorialId, setActiveTutorialId] = useState<string | null>(null);
  const [activeTutorialDef, setActiveTutorialDef] =
    useState<TutorialDefinition | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Tutorials waiting to be shown (deferred while another is active),
  // kept sorted by priority.
  const pendingQueueRef = useRef<TutorialDefinition[]>([]);

  // Preserved step index when a tutorial is hidden but not dismissed.
  // Re-registration should resume from here rather than from lastSeen + 1.
  const hiddenStepIndicesRef = useRef<Map<string, number>>(new Map());

  // Mirrors activeTutorialId synchronously. Registration must not read the
  // state value: all <Tutorial> effects of one commit flush before any
  // re-render, so they would all see the stale pre-update id and overwrite
  // each other's activation instead of queueing.
  const activeTutorialIdRef = useRef<string | null>(null);

  const clearActive = useCallback(() => {
    activeTutorialIdRef.current = null;
    setActiveTutorialId(null);
    setActiveTutorialDef(null);
    setCurrentStepIndex(0);
  }, []);

  const activate = useCallback(
    (def: TutorialDefinition) => {
      const hiddenStep = hiddenStepIndicesRef.current.get(def.id);
      hiddenStepIndicesRef.current.delete(def.id);
      activeTutorialIdRef.current = def.id;
      setActiveTutorialId(def.id);
      setActiveTutorialDef(def);
      setCurrentStepIndex(
        getTutorialStartIndex(def, tutorialState, hiddenStep),
      );
    },
    [tutorialState],
  );

  // Consume the next queued tutorial if one is still eligible
  const dequeueNext = useCallback(() => {
    const { next, remaining } = takeNextEligibleTutorial(
      pendingQueueRef.current,
      tutorialState,
      sessionDismissedTutorialIds,
    );
    pendingQueueRef.current = remaining;
    if (next) activate(next);
  }, [tutorialState, activate]);

  // Bring stagewise UI to foreground when a tutorial becomes active —
  // the overlay lives in the UI layer and must render above web content.
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  useEffect(() => {
    if (activeTutorialId) {
      void movePanelToForeground('stagewise-ui');
    }
  }, [activeTutorialId, movePanelToForeground]);

  // Defers activation to a microtask so all registrations from the same
  // commit land in the queue first — the highest-priority one then wins,
  // regardless of component mount/effect order.
  const activationScheduledRef = useRef(false);
  const dequeueNextRef = useRef(dequeueNext);
  dequeueNextRef.current = dequeueNext;
  const scheduleActivation = useCallback(() => {
    if (activationScheduledRef.current) return;
    activationScheduledRef.current = true;
    queueMicrotask(() => {
      activationScheduledRef.current = false;
      if (activeTutorialIdRef.current !== null) return;
      dequeueNextRef.current();
    });
  }, []);

  const registerTutorial = useCallback(
    (def: TutorialDefinition) => {
      if (sessionDismissedTutorialIds.has(def.id)) return;
      if (isTutorialCompleted(def, tutorialState)) return;
      // Already showing — don't queue a second run of the same tutorial.
      if (activeTutorialIdRef.current === def.id) return;

      // Always queue (sorted by priority, deduplicated), then activate the
      // best candidate asynchronously. Queueing while another tutorial is
      // active also prevents transient tutorials (like
      // workspace-selection-options) from being permanently lost.
      pendingQueueRef.current = insertQueuedTutorial(
        pendingQueueRef.current,
        def,
      );
      scheduleActivation();
    },
    [tutorialState, scheduleActivation],
  );

  const unregisterTutorial = useCallback(
    (tutorialId: string) => {
      // Hide if currently active
      if (activeTutorialId === tutorialId) {
        clearActive();
        dequeueNext();
      }
      // Remove from pending queue
      pendingQueueRef.current = pendingQueueRef.current.filter(
        (d) => d.id !== tutorialId,
      );
    },
    [activeTutorialId, clearActive, dequeueNext],
  );

  const persistStep = useCallback(
    (def: TutorialDefinition, stepIndex: number) => {
      const storageKey = getTutorialStorageKey(def);
      const lastSeenIndex = tutorialState[storageKey] ?? -1;
      // Only persist if we're advancing (don't persist going backward)
      if (stepIndex > lastSeenIndex) {
        // The persistence key is id + version so stale progress is
        // discarded when tutorial content changes.
        void setTutorialStep({ tutorialId: storageKey, stepIndex });
      }
    },
    [tutorialState, setTutorialStep],
  );

  const goToStep = useCallback(
    (index: number) => {
      if (!activeTutorialDef) return;
      if (index < 0 || index >= activeTutorialDef.steps.length) return;
      setCurrentStepIndex(index);
      persistStep(activeTutorialDef, index);
    },
    [activeTutorialDef, persistStep],
  );

  const goNext = useCallback(() => {
    if (!activeTutorialDef) return;
    const nextIndex = currentStepIndex + 1;
    const finished = nextIndex >= activeTutorialDef.steps.length;
    posthog.capture('tutorial_clicked_next', {
      tutorial_id: activeTutorialDef.id,
      tutorial_name: activeTutorialDef.id,
      step_index: currentStepIndex,
      total_steps: activeTutorialDef.steps.length,
      finished_tutorial: finished,
    });
    if (finished) {
      // Completed the last step — persist full completion and chain to the
      // next queued tutorial (natural completion keeps the flow going).
      persistStep(activeTutorialDef, activeTutorialDef.steps.length - 1);
      sessionDismissedTutorialIds.add(activeTutorialDef.id);
      clearActive();
      dequeueNext();
      return;
    }
    setCurrentStepIndex(nextIndex);
    persistStep(activeTutorialDef, nextIndex);
  }, [
    activeTutorialDef,
    currentStepIndex,
    persistStep,
    clearActive,
    dequeueNext,
  ]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0 && activeTutorialDef) {
      posthog.capture('tutorial_clicked_back', {
        tutorial_id: activeTutorialDef.id,
        tutorial_name: activeTutorialDef.id,
        step_index: currentStepIndex,
        total_steps: activeTutorialDef.steps.length,
      });
      setCurrentStepIndex((i) => i - 1);
    }
  }, [currentStepIndex, activeTutorialDef]);

  const skipCurrentStep = useCallback(() => {
    if (!activeTutorialDef) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < activeTutorialDef.steps.length) {
      // Advance without persisting — the user never saw this step.
      setCurrentStepIndex(nextIndex);
      return;
    }
    // Nothing left to show — hide without persisting completion so the
    // tutorial can show again in a future session.
    hiddenStepIndicesRef.current.set(activeTutorialDef.id, currentStepIndex);
    clearActive();
    dequeueNext();
  }, [activeTutorialDef, currentStepIndex, clearActive, dequeueNext]);

  const dismissTutorial = useCallback(() => {
    if (!activeTutorialDef) return;
    posthog.capture('tutorial_dismissed', {
      tutorial_id: activeTutorialDef.id,
      tutorial_name: activeTutorialDef.id,
      step_index: currentStepIndex,
      total_steps: activeTutorialDef.steps.length,
    });
    // Explicit dismissal (X / Escape) is permanent: persist full completion
    // so the tutorial doesn't reappear on the next app start.
    persistStep(activeTutorialDef, activeTutorialDef.steps.length - 1);
    sessionDismissedTutorialIds.add(activeTutorialDef.id);
    // Don't chain into more popovers right after the user opted out —
    // queued tutorials stay eligible and can register again later.
    pendingQueueRef.current = [];
    clearActive();
  }, [activeTutorialDef, currentStepIndex, persistStep, clearActive]);

  const hideTutorial = useCallback(() => {
    if (activeTutorialId && activeTutorialDef) {
      hiddenStepIndicesRef.current.set(activeTutorialId, currentStepIndex);
    }
    clearActive();
  }, [activeTutorialId, activeTutorialDef, currentStepIndex, clearActive]);

  const currentStep = useMemo(() => {
    if (!activeTutorialDef) return null;
    return activeTutorialDef.steps[currentStepIndex] ?? null;
  }, [activeTutorialDef, currentStepIndex]);

  const totalSteps = activeTutorialDef?.steps.length ?? 0;

  const value = useMemo<TutorialContextValue>(
    () => ({
      activeTutorial: activeTutorialDef,
      currentStep,
      currentStepIndex,
      totalSteps,
      goToStep,
      goNext,
      goBack,
      skipCurrentStep,
      dismissTutorial,
      hideTutorial,
      registerTutorial,
      unregisterTutorial,
    }),
    [
      activeTutorialDef,
      currentStep,
      currentStepIndex,
      totalSteps,
      goToStep,
      goNext,
      goBack,
      skipCurrentStep,
      dismissTutorial,
      hideTutorial,
      registerTutorial,
      unregisterTutorial,
    ],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}
