import { z } from 'zod';
import {
  reactSelectedElementInfoSchema,
  type ReactSelectedElementInfo,
} from './react';

export type { ReactSelectedElementInfo };

// Define the base schema without recursive fields
const baseSelectedElementSchema = z.object({
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
      // Typography
      fontFamily: z.string().optional(),
      fontSize: z.string().optional(),
      fontWeight: z.string().optional(),
      lineHeight: z.string().optional(),
      letterSpacing: z.string().optional(),
      color: z.string().optional(),
      textAlign: z.string().optional(),
      // Box model
      padding: z.string().optional(),
      margin: z.string().optional(),
      width: z.string().optional(),
      height: z.string().optional(),
      maxWidth: z.string().optional(),
      minWidth: z.string().optional(),
      maxHeight: z.string().optional(),
      minHeight: z.string().optional(),
      // Background & borders
      backgroundColor: z.string().optional(),
      backgroundImage: z.string().optional(),
      border: z.string().optional(),
      borderRadius: z.string().optional(),
      // Layout
      display: z.string().optional(),
      position: z.string().optional(),
      top: z.string().optional(),
      right: z.string().optional(),
      bottom: z.string().optional(),
      left: z.string().optional(),
      zIndex: z.string().optional(),
      // Flexbox/Grid
      flexDirection: z.string().optional(),
      alignItems: z.string().optional(),
      justifyContent: z.string().optional(),
      gap: z.string().optional(),
      flexWrap: z.string().optional(),
      // Grid-specific
      gridTemplateColumns: z.string().optional(),
      gridTemplateRows: z.string().optional(),
      gridColumn: z.string().optional(),
      gridRow: z.string().optional(),
      // Effects
      boxShadow: z.string().optional(),
      opacity: z.string().optional(),
      overflow: z.string().optional(),
      filter: z.string().optional(),
      backdropFilter: z.string().optional(),
      transform: z.string().optional(),
      // Transitions & animations
      transition: z.string().optional(),
      animation: z.string().optional(),
      // Interactivity & visibility
      cursor: z.string().optional(),
      visibility: z.string().optional(),
      pointerEvents: z.string().optional(),
    })
    .optional(),
  // Pseudo-element styles (::before, ::after)
  pseudoElements: z
    .object({
      before: z
        .object({
          content: z.string().optional(),
          display: z.string().optional(),
          position: z.string().optional(),
          width: z.string().optional(),
          height: z.string().optional(),
          backgroundColor: z.string().optional(),
          backgroundImage: z.string().optional(),
          border: z.string().optional(),
          borderRadius: z.string().optional(),
          boxShadow: z.string().optional(),
          transform: z.string().optional(),
          opacity: z.string().optional(),
          top: z.string().optional(),
          left: z.string().optional(),
          right: z.string().optional(),
          bottom: z.string().optional(),
          zIndex: z.string().optional(),
        })
        .optional(),
      after: z
        .object({
          content: z.string().optional(),
          display: z.string().optional(),
          position: z.string().optional(),
          width: z.string().optional(),
          height: z.string().optional(),
          backgroundColor: z.string().optional(),
          backgroundImage: z.string().optional(),
          border: z.string().optional(),
          borderRadius: z.string().optional(),
          boxShadow: z.string().optional(),
          transform: z.string().optional(),
          opacity: z.string().optional(),
          top: z.string().optional(),
          left: z.string().optional(),
          right: z.string().optional(),
          bottom: z.string().optional(),
          zIndex: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

// Extend the base schema with recursive fields using z.lazy
export const selectedElementSchema = baseSelectedElementSchema.extend({
  parent: baseSelectedElementSchema.optional(),
  siblings: z.array(baseSelectedElementSchema),
  children: z.array(baseSelectedElementSchema),
});

// Derive the TypeScript type from the schema
export type SelectedElement = z.infer<typeof selectedElementSchema> & {
  parent?: SelectedElement;
  siblings: SelectedElement[];
  children: SelectedElement[];
};
