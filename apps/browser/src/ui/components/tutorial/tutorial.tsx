import { useEffect, useRef } from 'react';
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

  // Ref-stabilize callbacks so effect cleanups don't re-run when provider
  // state changes (e.g. tutorial progress updates) give them new identities.
  const unregisterRef = useRef(unregisterTutorial);
  unregisterRef.current = unregisterTutorial;
  const hideRef = useRef(hideTutorial);
  hideRef.current = hideTutorial;
  const registerRef = useRef(registerTutorial);
  registerRef.current = registerTutorial;

  useEffect(() => {
    if (!enabled) return;
    registerRef.current({ id: tutorialId, steps });
  }, [enabled, tutorialId, steps]);

  useEffect(() => {
    if (!enabled && activeTutorial?.id === tutorialId) {
      hideRef.current();
    }
  }, [enabled, activeTutorial, tutorialId]);

  // Unregister when this tutorial's source unmounts — prevents queued
  // tutorials from starting after their trigger UI is gone.
  useEffect(() => {
    return () => unregisterRef.current(tutorialId);
  }, [tutorialId]);

  // Also unregister when enabled becomes false (clean up queue entry)
  useEffect(() => {
    if (!enabled) unregisterRef.current(tutorialId);
  }, [enabled, tutorialId]);

  return null;
}
