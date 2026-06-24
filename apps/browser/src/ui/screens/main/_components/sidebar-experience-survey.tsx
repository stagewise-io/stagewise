import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { XIcon, MessageSquareTextIcon, PresentationIcon } from 'lucide-react';

const MESSAGE_THRESHOLD = 3;
const DISMISS_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_DISMISS_COUNT = 3;

const FOUNDER_CALL_MESSAGE_THRESHOLD = 20;
const FOUNDER_CALL_USAGE_DAYS = 4;
const FOUNDER_CALL_STAGGER_MS = 24 * 60 * 60 * 1000; // 24 hours
const BOOKING_URL = 'https://stagewise.io/call';

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

  // Count total messages across all active agents
  const totalMessages = useKartonState((s) => {
    let count = 0;
    for (const instance of Object.values(s.agents.instances)) {
      count += instance.state.history.length;
    }
    return count;
  });

  // ── First survey visibility ──
  const shouldShow = useMemo(() => {
    if (submitted) return false;
    if (survey.answered) return false;
    if (totalMessages <= MESSAGE_THRESHOLD) return false;

    // If never dismissed, show
    if (survey.dismissedAt === null || survey.dismissedCount === 0) return true;

    // If dismissed max times, don't show
    if (survey.dismissedCount >= MAX_DISMISS_COUNT) return false;

    // Show again after cooldown
    return Date.now() - survey.dismissedAt >= DISMISS_COOLDOWN_MS;
  }, [survey, totalMessages, submitted]);

  // ── Second (founder call) survey visibility ──
  const shouldShowFounderCall = useMemo(() => {
    // Never show at the same time as the first survey
    if (shouldShow) return false;

    if (founderCallSurvey.answered) return false;
    if (totalMessages < FOUNDER_CALL_MESSAGE_THRESHOLD) return false;

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

    // Dismiss logic (same pattern as first survey)
    if (
      founderCallSurvey.dismissedAt === null ||
      founderCallSurvey.dismissedCount === 0
    )
      return true;
    if (founderCallSurvey.dismissedCount >= MAX_DISMISS_COUNT) return false;
    return Date.now() - founderCallSurvey.dismissedAt >= DISMISS_COOLDOWN_MS;
  }, [shouldShow, founderCallSurvey, totalMessages, firstUsedAt, survey]);

  const [hasAnswered, setHasAnswered] = useState(false);

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
      <div className="relative flex shrink-0 flex-col gap-2 rounded-md bg-background/60 p-2.5 shadow-elevation-1 ring-1 ring-derived-strong backdrop-blur-xl dark:bg-surface-1/60">
        {!hasAnswered ? (
          <>
            <div className="flex items-center gap-1.5">
              <MessageSquareTextIcon className="size-3.5 shrink-0 text-foreground" />
              <div className="mt-0.5 min-w-0 flex-1 font-medium text-foreground text-xs">
                Do you enjoy your experience with stagewise?
              </div>
              <Button
                variant="ghost"
                size="icon-2xs"
                className="ml-auto shrink-0"
                aria-label="Dismiss survey"
                onClick={handleDismiss}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                className="flex-1"
                onClick={() => handleAnswer('no')}
              >
                No
              </Button>
              <Button
                variant="secondary"
                size="xs"
                className="flex-1"
                onClick={() => handleAnswer('yes')}
              >
                Yes
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <MessageSquareTextIcon className="size-3.5 shrink-0 text-foreground" />
              <div className="mt-0.5 min-w-0 flex-1 font-medium text-foreground text-xs">
                What could we improve?
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className="scrollbar-subtle w-full resize-none rounded-md border border-derived bg-surface-1 px-2.5 py-2 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-foreground"
              placeholder="What could we improve?"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmitFeedback();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSubmitted(true)}
              >
                Skip
              </Button>
              <Button
                variant="secondary"
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
      <div className="relative flex shrink-0 flex-col gap-2 rounded-md bg-background/60 p-2.5 shadow-elevation-1 ring-1 ring-derived-strong backdrop-blur-xl dark:bg-surface-1/60">
        <div className="flex items-start gap-1.5">
          <PresentationIcon className="mt-0.5 size-3.5 shrink-0 text-foreground" />
          <div className="min-w-0 flex-1 font-medium text-foreground text-xs">
            Tell our founders what you think and get free Pro subscription for
            one month!
          </div>
          <Button
            variant="ghost"
            size="icon-2xs"
            className="ml-auto shrink-0"
            aria-label="Dismiss survey"
            onClick={handleDismissFounderCall}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
        <Button
          variant="secondary"
          size="xs"
          className="w-full"
          onClick={handleOpenFounderCall}
        >
          Book a call
        </Button>
      </div>
    );
  }

  return null;
}
