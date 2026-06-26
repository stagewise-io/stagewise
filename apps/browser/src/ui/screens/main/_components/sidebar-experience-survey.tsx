import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import {
  IconXmarkOutline18,
  IconVideoOutline18,
  IconThumbsUpOutline18,
  IconThumbsDownOutline18,
} from 'nucleo-ui-outline-18';

const MESSAGE_THRESHOLD = 5;
const DISMISS_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_DISMISS_COUNT = 3;

const FOUNDER_CALL_AGENT_THRESHOLD = 10;
const FOUNDER_CALL_USAGE_DAYS = 4;
const FOUNDER_CALL_STAGGER_MS = 24 * 60 * 60 * 1000; // 24 hours
const FOUNDER_CALL_DISMISS_COOLDOWN_MS = 96 * 60 * 60 * 1000; // 96 hours
const BOOKING_URL = 'https://calendar.app.google/McsonxboNHu7oyUF8';

export function SidebarExperienceSurvey() {
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── First survey state ──
  const survey = useKartonState(
    (s) => s.userExperience.storedExperienceData.experienceSurvey,
  );
  const answerSurvey = useKartonProcedure(
    (p) => p.userExperience.survey.answer,
  );
  const dismissSurvey = useKartonProcedure(
    (p) => p.userExperience.survey.dismiss,
  );
  const submitFeedback = useKartonProcedure(
    (p) => p.userExperience.survey.submitFeedback,
  );

  // ── Second (founder call) survey state ──
  const founderCallSurvey = useKartonState(
    (s) => s.userExperience.storedExperienceData.founderCallSurvey,
  );
  const firstUsedAt = useKartonState(
    (s) => s.userExperience.storedExperienceData.firstUsedAt,
  );
  const openFounderCallSurvey = useKartonProcedure(
    (p) => p.userExperience.founderCall.survey.open,
  );
  const dismissFounderCallSurvey = useKartonProcedure(
    (p) => p.userExperience.founderCall.survey.dismiss,
  );

  // Total agent count from DB (via storedExperienceData)
  const totalAgentCount = useKartonState(
    (s) => s.userExperience.storedExperienceData.totalAgentCount,
  );

  // Count total user messages across all active agents (first survey trigger)
  const totalUserMessages = useKartonState((s) => {
    let count = 0;
    for (const instance of Object.values(s.agents.instances)) {
      count += instance.state.history.filter((m) => m.role === 'user').length;
    }
    return count;
  });

  const [hasAnswered, setHasAnswered] = useState(false);

  // ── First survey visibility ──
  const shouldShow = useMemo(() => {
    if (submitted) return false;
    // Keep the survey visible while the user is in the feedback phase,
    // even though the backend already marked it as answered.
    if (survey.answered && !hasAnswered) return false;
    if (totalUserMessages <= MESSAGE_THRESHOLD) return false;

    // If never dismissed, show
    if (survey.dismissedAt === null || survey.dismissedCount === 0) return true;

    // If dismissed max times, don't show
    if (survey.dismissedCount >= MAX_DISMISS_COUNT) return false;

    // Show again after cooldown
    return Date.now() - survey.dismissedAt >= DISMISS_COOLDOWN_MS;
  }, [survey, totalUserMessages, submitted, hasAnswered]);

  // ── Second (founder call) survey visibility ──
  const shouldShowFounderCall = useMemo(() => {
    // Never show at the same time as the first survey
    if (shouldShow) return false;

    if (founderCallSurvey.answered) return false;
    if (totalAgentCount < FOUNDER_CALL_AGENT_THRESHOLD) return false;

    // Must have used stagewise for at least 4 days
    if (firstUsedAt === null) return false;
    const daysSinceFirstUse =
      (Date.now() - firstUsedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceFirstUse < FOUNDER_CALL_USAGE_DAYS) return false;

    // Must appear at least 24h after the first survey was resolved
    const firstSurveyResolvedAt = survey.answeredAt ?? survey.dismissedAt;
    if (firstSurveyResolvedAt === null) return false;
    if (Date.now() - firstSurveyResolvedAt < FOUNDER_CALL_STAGGER_MS) {
      return false;
    }

    // Dismiss logic: reappear after 96h cooldown, up to 3 dismissals total.
    if (
      founderCallSurvey.dismissedAt === null ||
      founderCallSurvey.dismissedCount === 0
    )
      return true;
    if (founderCallSurvey.dismissedCount >= MAX_DISMISS_COUNT) return false;
    return (
      Date.now() - founderCallSurvey.dismissedAt >=
      FOUNDER_CALL_DISMISS_COOLDOWN_MS
    );
  }, [shouldShow, founderCallSurvey, totalAgentCount, firstUsedAt, survey]);

  const handleAnswer = useCallback(
    (answer: 'yes' | 'no') => {
      setHasAnswered(true);
      void answerSurvey(answer);
      // Focus the textarea on next render
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [answerSurvey],
  );

  const handleDismiss = useCallback(() => {
    void dismissSurvey();
  }, [dismissSurvey]);

  const handleSubmitFeedback = useCallback(() => {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    void submitFeedback(trimmed);
    setSubmitted(true);
  }, [feedback, submitFeedback]);

  const handleOpenFounderCall = useCallback(() => {
    void openFounderCallSurvey();
    window.open(BOOKING_URL, '_blank');
  }, [openFounderCallSurvey]);

  const handleDismissFounderCall = useCallback(() => {
    void dismissFounderCallSurvey();
  }, [dismissFounderCallSurvey]);

  // ── First survey ──
  if (shouldShow) {
    return (
      <div className="relative flex shrink-0 flex-col gap-2 rounded-md bg-background/30 p-2.5 shadow-elevation-1 ring-1 ring-derived-subtle backdrop-blur-xl dark:bg-surface-1/30">
        {!hasAnswered ? (
          <>
            <Button
              variant="ghost"
              size="icon-2xs"
              className="absolute top-1.5 right-1.5 z-10 shrink-0"
              aria-label="Dismiss survey"
              onClick={handleDismiss}
            >
              <IconXmarkOutline18 className="size-3" />
            </Button>
            <div className="pr-7 font-medium text-foreground text-xs leading-relaxed">
              Do you enjoy your experience with stagewise?
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                className="flex-1"
                aria-label="No"
                onClick={() => handleAnswer('no')}
              >
                <IconThumbsDownOutline18 className="size-3.5" />
                No
              </Button>
              <Button
                variant="secondary"
                size="xs"
                className="flex-1"
                aria-label="Yes"
                onClick={() => handleAnswer('yes')}
              >
                <IconThumbsUpOutline18 className="size-3.5" />
                Yes
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon-2xs"
              className="absolute top-1.5 right-1.5 z-10 shrink-0"
              aria-label="Dismiss survey"
              onClick={() => setSubmitted(true)}
            >
              <IconXmarkOutline18 className="size-3" />
            </Button>
            <div className="pr-7 font-medium text-foreground text-xs leading-relaxed">
              What could we improve?
            </div>
            <textarea
              ref={textareaRef}
              className="scrollbar-subtle w-full resize-none rounded-md border border-derived bg-surface-1 px-2.5 py-2 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-foreground"
              placeholder="What could we improve?"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitFeedback();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="primary"
                size="xs"
                disabled={!feedback.trim()}
                onClick={handleSubmitFeedback}
              >
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Second (founder call) survey ──
  if (shouldShowFounderCall) {
    return (
      <div className="relative flex shrink-0 flex-col gap-2 rounded-md bg-background/30 p-2.5 shadow-elevation-1 ring-1 ring-derived-subtle backdrop-blur-xl dark:bg-surface-1/30">
        <Button
          variant="ghost"
          size="icon-2xs"
          className="absolute top-1.5 right-1.5 z-10 shrink-0"
          aria-label="Dismiss survey"
          onClick={handleDismissFounderCall}
        >
          <IconXmarkOutline18 className="size-3" />
        </Button>
        <div className="pr-7 font-medium text-foreground text-xs leading-relaxed">
          Tell our founders what you think about stagewise and get 1 month Pro
          for free!
        </div>
        <Button
          variant="primary"
          size="xs"
          className="w-full"
          onClick={handleOpenFounderCall}
        >
          <IconVideoOutline18 className="size-3.5" />
          Book a call
        </Button>
      </div>
    );
  }

  return null;
}
