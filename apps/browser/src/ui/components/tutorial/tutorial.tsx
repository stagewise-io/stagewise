import { useEffect, useRef } from 'react';
import { useTutorial } from '@ui/contexts/tutorial';
import {
  TUTORIALS,
  TUTORIAL_PRIORITY,
  type TutorialId,
} from '@ui/tutorial-steps';

interface TutorialProps {
  /** Which tutorial to trigger — steps and version come from `TUTORIALS` */
  tutorialId: TutorialId;
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
export function Tutorial({ tutorialId, enabled = true }: TutorialProps) {
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
    const content = TUTORIALS[tutorialId];
    registerRef.current({
      id: tutorialId,
      version: content.version,
      steps: content.steps,
      priority: TUTORIAL_PRIORITY.indexOf(tutorialId),
    });
  }, [enabled, tutorialId]);

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
