import { z } from 'zod';
import {
  reactSelectedElementInfoSchema,
  type ReactSelectedElementInfo,
} from './react';
import type { SelectedElement } from './index';

export type { ReactSelectedElementInfo };

/**
 * Schema for `.swdomelement` files stored on disk as JSON.
 *
 * This is the serialisation format for selected DOM elements.
 * It captures the full SelectedElement data plus context fields
 * (tab ID, URL) that are only known at selection time.
 *
 * Backwards-friendly: all fields except `tagName` are optional so older
 * files can still be parsed.
 */
export const swDomElementSchema = z.object({
  // ── Context fields (captured at selection time) ──────────────────────
  tab_id: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),

  // ── Element identity ─────────────────────────────────────────────────
  tagName: z.string(),
  nodeType: z.string().optional(),
  stagewiseId: z.string().optional(),
  xpath: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  ownProperties: z.record(z.string(), z.any()).optional(),

  // ── Content ──────────────────────────────────────────────────────────
  innerText: z.string().optional(),

  // ── Framework info ───────────────────────────────────────────────────
  react: reactSelectedElementInfoSchema.nullable().optional(),
  vue: z.record(z.string(), z.any()).nullable().optional(),

  // ── Visual ───────────────────────────────────────────────────────────
  boundingClientRect: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  screenshot: z.string().optional(), // blob key of the .screenshot.webp file in the agent attachments dir

  // ── Styles ───────────────────────────────────────────────────────────
  computedStyles: z.record(z.string(), z.string().optional()).optional(),
  pseudoElements: z
    .object({
      before: z.record(z.string(), z.string().optional()).optional(),
      after: z.record(z.string(), z.string().optional()).optional(),
    })
    .optional(),
  interactionState: z
    .object({
      hover: z.boolean().optional(),
      active: z.boolean().optional(),
      focus: z.boolean().optional(),
      focusWithin: z.boolean().optional(),
    })
    .optional(),

  // ── Hierarchy ────────────────────────────────────────────────────────
  parent: z
    .object({
      tagName: z.string(),
      attributes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  siblings: z
    .array(
      z.object({
        tagName: z.string(),
      }),
    )
    .optional(),
  children: z
    .array(
      z.object({
        tagName: z.string(),
      }),
    )
    .optional(),

  // ── Frame context ────────────────────────────────────────────────────
  frameId: z.string().optional(),
  isMainFrame: z.boolean().optional(),
  frameLocation: z.string().optional(),
  frameTitle: z.string().nullable().optional(),

  // ── Source code references ───────────────────────────────────────────
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
});

export type SwDomElement = z.infer<typeof swDomElementSchema>;

/**
 * Convert a SelectedElement (runtime object from the tracker) into the
 * `.swdomelement` on-disk JSON format.
 *
 * @param element   The SelectedElement captured by the tracker.
 * @param context   Additional context known at selection time.
 */
export function selectedElementToSwDomElement(
  element: SelectedElement,
  context: { tabId?: string; url?: string },
): SwDomElement {
  return {
    // Context
    tab_id: element.tabId ?? context.tabId,
    url: context.url,

    // Identity
    tagName: element.tagName,
    nodeType: element.nodeType,
    stagewiseId: element.stagewiseId,
    xpath: element.xpath,
    attributes: element.attributes,
    ownProperties: element.ownProperties,

    // Content
    innerText: element.innerText,

    // Framework info
    react: element.frameworkInfo?.react ?? null,
    vue: null,

    // Visual
    boundingClientRect: {
      x: element.boundingClientRect.left,
      y: element.boundingClientRect.top,
      width: element.boundingClientRect.width,
      height: element.boundingClientRect.height,
    },
    screenshot: undefined, // Populated separately if screenshot capture succeeds

    // Styles
    computedStyles: element.computedStyles as
      | Record<string, string | undefined>
      | undefined,
    pseudoElements: element.pseudoElements as
      | {
          before?: Record<string, string | undefined>;
          after?: Record<string, string | undefined>;
        }
      | undefined,
    interactionState: element.interactionState,

    // Hierarchy (flattened — only the light summary, not full recursive trees)
    parent: element.parent
      ? {
          tagName: element.parent.tagName,
          attributes: element.parent.attributes,
        }
      : undefined,
    siblings: element.siblings?.map((s) => ({
      tagName: s.tagName,
    })),
    children: element.children?.map((c) => ({
      tagName: c.tagName,
    })),

    // Frame context
    frameId: element.frameId,
    isMainFrame: element.isMainFrame,
    frameLocation: element.frameLocation,
    frameTitle: element.frameTitle,

    // Source code references
    codeMetadata: element.codeMetadata,
  };
}
