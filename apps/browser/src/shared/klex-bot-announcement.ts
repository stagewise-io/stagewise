import { z } from 'zod';

export const KLEX_BOT_ANNOUNCEMENT_ID = 'klex-bot';
export const ANNOUNCEMENT_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

// Sanitize fields individually: a damaged timestamp must not undo an opt-out.
export const klexBotAnnouncementSchema = z.preprocess(
  (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : {},
  z.object({
    initialPresentationConsumed: z.boolean().catch(false),
    remindAt: z
      .number()
      .int()
      .nonnegative()
      .max(8.64e15)
      .nullable()
      .catch(null),
    permanentlyDismissed: z.boolean().catch(false),
  }),
);

export type KlexBotAnnouncementState = z.infer<
  typeof klexBotAnnouncementSchema
>;
export const announcementDismissalSchema = z.enum(['remind', 'never']);
export type AnnouncementDismissal = z.infer<typeof announcementDismissalSchema>;

export function isAnnouncementCardEligible(
  state: KlexBotAnnouncementState | null,
  now: number,
): boolean {
  return !!(
    state?.initialPresentationConsumed &&
    !state.permanentlyDismissed &&
    (state.remindAt === null || state.remindAt <= now)
  );
}
