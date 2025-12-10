import { z } from 'zod';
import {
  reactSelectedElementInfoSchema,
  type ReactSelectedElementInfo,
} from './react';

export type { ReactSelectedElementInfo };

// Define the base schema without recursive fields
const baseContextElementSchema = z.object({
  id: z.string().optional(),
  stagewiseId: z.string().optional(),
  tagName: z.string(),
  nodeType: z.string().optional(), // Alias for tagName, kept for compatibility
  attributes: z.record(z.string(), z.string()),
  ownProperties: z.record(z.string(), z.any()),
  boundingClientRect: z.object({
    top: z.number(),
    left: z.number(),
    height: z.number(),
    width: z.number(),
  }),
  xpath: z.string(),
  textContent: z.string(),
  frameworkInfo: z
    .object({
      react: reactSelectedElementInfoSchema.nullable().optional(),
    })
    .optional(),
  // Additional fields from SelectedElement
  frameId: z.string().optional(),
  isMainFrame: z.boolean().optional(),
  frameLocation: z.string().optional(),
  frameTitle: z.string().nullable().optional(),
  backendNodeId: z.number().optional(),
  tabId: z.string().optional(),
  codeMetadata: z
    .array(
      z.object({
        relation: z.string(),
        relativePath: z.string(),
        startLine: z.number().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  computedStyles: z
    .object({
      fontFamily: z.string().optional(),
      backgroundColor: z.string().optional(),
      backgroundImage: z.string().optional(), // Truncated to 500 characters
      border: z.string().optional(),
      boxShadow: z.string().optional(),
      filter: z.string().optional(),
      transform: z.string().optional(),
    })
    .optional(),
});

// Extend the base schema with recursive fields using z.lazy
export const contextElementSchema = baseContextElementSchema.extend({
  parent: z.lazy(() => contextElementSchema).nullable(),
  siblings: z.array(z.lazy(() => contextElementSchema)),
  children: z.array(z.lazy(() => contextElementSchema)),
});

// Derive the TypeScript type from the schema
export type ContextElement = z.infer<typeof contextElementSchema>;
