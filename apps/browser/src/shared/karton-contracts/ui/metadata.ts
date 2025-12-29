import { z } from 'zod';
import { MainTab } from './index';
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
  currentTab: z.enum(MainTab).optional(), // optional because it is set by the agent -> TODO: find a type-safe way
  browserData: browserDataSchema.optional(),
  thinkingDurations: z.array(z.number()).optional(),
});

export type UserMessageMetadata = z.infer<typeof metadataSchema>;
