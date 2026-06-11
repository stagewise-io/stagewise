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
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import type { TutorialDefinition, TutorialStep } from './types';

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
  /** Dismiss the current tutorial (saves progress) */
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

  // Queue of tutorials waiting to be shown (deferred when another is active)
  const pendingQueueRef = useRef<TutorialDefinition[]>([]);

  // Preserved step index when a tutorial is hidden but not dismissed.
  // Re-registration should resume from here rather than from lastSeen + 1.
  const hiddenStepIndicesRef = useRef<Map<string, number>>(new Map());

  // Consume the next queued tutorial if one is waiting
  const dequeueNext = useCallback(() => {
    const queue = pendingQueueRef.current;
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (sessionDismissedTutorialIds.has(next.id)) continue;
      const lastSeen = tutorialState[next.id] ?? -1;
      if (lastSeen >= next.steps.length - 1) continue;
      setActiveTutorialId(next.id);
      setActiveTutorialDef(next);
      setCurrentStepIndex(lastSeen + 1);
      return;
    }
  }, [tutorialState]);

  // Bring stagewise UI to foreground when a tutorial becomes active
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  useEffect(() => {
    if (activeTutorialId) {
      void movePanelToForeground('stagewise-ui');
    }
  }, [activeTutorialId, movePanelToForeground]);

  const registerTutorial = useCallback(
    (def: TutorialDefinition) => {
      if (sessionDismissedTutorialIds.has(def.id)) return;

      const lastSeenIndex = tutorialState[def.id] ?? -1;
      // Tutorial already fully seen — don't show
      if (lastSeenIndex >= def.steps.length - 1) return;

      // If another tutorial is currently active, queue this one for later.
      // This prevents transient tutorials (like workspace-selection-options)
      // from being permanently lost when they register during an active tutorial.
      if (activeTutorialId !== null) {
        // Avoid queueing the same tutorial multiple times
        if (!pendingQueueRef.current.some((d) => d.id === def.id)) {
          pendingQueueRef.current.push(def);
        }
        return;
      }

      // Start at the first unseen step, or resume from where the
      // tutorial was hidden if it was hidden but not dismissed.
      const hiddenStep = hiddenStepIndicesRef.current.get(def.id);
      hiddenStepIndicesRef.current.delete(def.id);
      const startIndex = hiddenStep ?? lastSeenIndex + 1;
      setActiveTutorialId(def.id);
      setActiveTutorialDef(def);
      setCurrentStepIndex(startIndex);
    },
    [activeTutorialId, tutorialState],
  );

  const unregisterTutorial = useCallback(
    (tutorialId: string) => {
      // Hide if currently active
      if (activeTutorialId === tutorialId) {
        setActiveTutorialId(null);
        setActiveTutorialDef(null);
        setCurrentStepIndex(0);
        dequeueNext();
      }
      // Remove from pending queue
      const queue = pendingQueueRef.current;
      const idx = queue.findIndex((d) => d.id === tutorialId);
      if (idx !== -1) queue.splice(idx, 1);
    },
    [activeTutorialId, dequeueNext],
  );

  const persistStep = useCallback(
    (tutorialId: string, stepIndex: number) => {
      const lastSeenIndex = tutorialState[tutorialId] ?? -1;
      // Only persist if we're advancing (don't persist going backward)
      if (stepIndex > lastSeenIndex) {
        void setTutorialStep({ tutorialId, stepIndex });
      }
    },
    [tutorialState, setTutorialStep],
  );

  const goToStep = useCallback(
    (index: number) => {
      if (!activeTutorialDef) return;
      if (index < 0 || index >= activeTutorialDef.steps.length) return;
      setCurrentStepIndex(index);
      persistStep(activeTutorialDef.id, index);
    },
    [activeTutorialDef, persistStep],
  );

  const goNext = useCallback(() => {
    if (!activeTutorialDef) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= activeTutorialDef.steps.length) {
      // On the last step, hitting "next" dismisses with max index saved
      persistStep(activeTutorialDef.id, activeTutorialDef.steps.length - 1);
      sessionDismissedTutorialIds.add(activeTutorialDef.id);
      setActiveTutorialId(null);
      setActiveTutorialDef(null);
      setCurrentStepIndex(0);
      dequeueNext();
      return;
    }
    setCurrentStepIndex(nextIndex);
    persistStep(activeTutorialDef.id, nextIndex);
  }, [activeTutorialDef, currentStepIndex, persistStep, dequeueNext]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  }, [currentStepIndex]);

  const dismissTutorial = useCallback(() => {
    if (!activeTutorialDef) return;
    // Save the max of current index or last persisted
    const lastSeenIndex = tutorialState[activeTutorialDef.id] ?? -1;
    const saveIndex = Math.max(currentStepIndex, lastSeenIndex);
    void setTutorialStep({
      tutorialId: activeTutorialDef.id,
      stepIndex: saveIndex,
    });
    sessionDismissedTutorialIds.add(activeTutorialDef.id);
    setActiveTutorialId(null);
    setActiveTutorialDef(null);
    setCurrentStepIndex(0);
    dequeueNext();
  }, [
    activeTutorialDef,
    currentStepIndex,
    tutorialState,
    setTutorialStep,
    dequeueNext,
  ]);

  const hideTutorial = useCallback(() => {
    if (activeTutorialId && activeTutorialDef) {
      hiddenStepIndicesRef.current.set(activeTutorialId, currentStepIndex);
    }
    setActiveTutorialId(null);
    setActiveTutorialDef(null);
    setCurrentStepIndex(0);
  }, [activeTutorialId, activeTutorialDef, currentStepIndex]);

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
