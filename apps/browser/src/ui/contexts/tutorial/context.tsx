import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
      // Don't register if another tutorial is already active or this tutorial
      // was explicitly dismissed during the current renderer session.
      if (
        activeTutorialId !== null ||
        sessionDismissedTutorialIds.has(def.id)
      ) {
        return;
      }

      const lastSeenIndex = tutorialState[def.id] ?? -1;
      // Tutorial already fully seen — don't show
      if (lastSeenIndex >= def.steps.length - 1) return;

      // Start at the first unseen step
      const startIndex = lastSeenIndex + 1;
      setActiveTutorialId(def.id);
      setActiveTutorialDef(def);
      setCurrentStepIndex(startIndex);
    },
    [activeTutorialId, tutorialState],
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
      return;
    }
    setCurrentStepIndex(nextIndex);
    persistStep(activeTutorialDef.id, nextIndex);
  }, [activeTutorialDef, currentStepIndex, persistStep]);

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
  }, [activeTutorialDef, currentStepIndex, tutorialState, setTutorialStep]);

  const hideTutorial = useCallback(() => {
    setActiveTutorialId(null);
    setActiveTutorialDef(null);
    setCurrentStepIndex(0);
  }, []);

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
    ],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}
