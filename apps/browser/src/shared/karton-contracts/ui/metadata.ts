import { z } from 'zod';
import { selectedElementSchema } from '../../selected-elements';

export const browserDataSchema = z.object({
  viewport: z.object({
    width: z.number().min(0),
    height: z.number().min(0),
    dpr: z.number(),
  }),
  currentUrl: z.string().max(1024).url(),
  currentTitle: z.string().max(256).nullable(),
  userAgent: z.string().max(1024),
  locale: z.string().max(64),
  prefersDarkMode: z.boolean(),
});

export type BrowserData = z.infer<typeof browserDataSchema>;

const metadataSchema = z.object({
  createdAt: z.date(),
  selectedPreviewElements: z.array(selectedElementSchema).optional(),
  browserData: browserDataSchema.optional(),
  thinkingDurations: z.array(z.number()).optional(),
  autoCompactInformation: z
    .object({
      isAutoCompacted: z.literal(true),
      compactedAt: z.date(),
      chatSummary: z.string(),
    })
    .optional(),
  rejectedEdits: z.array(z.string()).optional(),
});

export type UserMessageMetadata = z.infer<typeof metadataSchema>;
