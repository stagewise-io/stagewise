import { useEffect } from 'react';
import { useTutorial } from '@ui/contexts/tutorial';
import type { TutorialStep } from '@ui/contexts/tutorial';

interface TutorialProps {
  /** Unique identifier for this tutorial */
  tutorialId: string;
  /** Ordered list of steps */
  steps: TutorialStep[];
  /** Whether this tutorial is currently eligible to run */
  enabled?: boolean;
}

/**
 * Place this component inside a feature's render tree. When the feature
 * renders and the tutorial hasn't been completed, it registers with the
 * TutorialProvider to show the tutorial overlay.
 *
 * Renders nothing — it's purely a trigger.
 */
export function Tutorial({ tutorialId, steps, enabled = true }: TutorialProps) {
  const { activeTutorial, hideTutorial, registerTutorial, unregisterTutorial } =
    useTutorial();

  useEffect(() => {
    if (!enabled) return;
    registerTutorial({ id: tutorialId, steps });
  }, [enabled, tutorialId, steps, registerTutorial]);

  useEffect(() => {
    if (!enabled && activeTutorial?.id === tutorialId) {
      hideTutorial();
    }
  }, [enabled, activeTutorial, tutorialId, hideTutorial]);

  // Unregister when this tutorial's source unmounts — prevents queued
  // tutorials from starting after their trigger UI is gone.
  useEffect(() => {
    return () => unregisterTutorial(tutorialId);
  }, [tutorialId, unregisterTutorial]);

  // Also unregister when enabled becomes false (clean up queue entry)
  useEffect(() => {
    if (!enabled) unregisterTutorial(tutorialId);
  }, [enabled, tutorialId, unregisterTutorial]);

  return null;
}
