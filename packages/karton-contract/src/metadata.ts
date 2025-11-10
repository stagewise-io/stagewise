import { z } from 'zod';
import { MainTab } from './index.js';

export const baseReactSelectedElementInfoSchema = z.object({
  componentName: z
    .string()
    .min(1)
    .max(1024)
    .catch((input) => input.toString().slice(0, 1024)),
  serializedProps: z.record(z.string(), z.any()).transform((obj) => {
    // Truncate the props to a maximum of 20 entries. Then stringify everything and truncate to 100 characters if it's longer. Add "...[TRUNCATED]" if it's truncated.
    const truncatedProps = Object.entries(obj).slice(0, 20);
    const serializedProps = truncatedProps.map(([key, value]) => {
      let serializedValue: string;
      try {
        serializedValue = JSON.stringify(value);
        if (serializedValue.length > 100) {
          serializedValue = `${serializedValue.slice(0, 100)}...[TRUNCATED]`;
        }
      } catch {
        serializedValue = '[NOT SERIALIZABLE]';
      }
      return [key, serializedValue];
    });
    return Object.fromEntries(serializedProps);
  }),
  isRSC: z.boolean(),
});
export const reactSelectedElementInfoSchema = baseReactSelectedElementInfoSchema
  .extend({
    parent: baseReactSelectedElementInfoSchema.nullable().optional(),
  })
  .nullable();

export type ReactSelectedElementInfo = z.infer<
  typeof reactSelectedElementInfoSchema
>;

/** Information about a selected element */
export const baseSelectedElementSchema = z.object({
  stagewiseId: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'A unique identifier for the element. This is used to track the element across different sessions.',
    ),
  nodeType: z.string().min(1).max(96).describe('The node type of the element.'),
  xpath: z.string().min(1).max(1024).describe('The XPath of the element.'),
  attributes: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
    .transform((obj) => {
      // Define the important attributes that should never be truncated
      const importantAttributes = new Set([
        'class',
        'id',
        'style',
        'name',
        'role',
        'href',
        'for',
        'placeholder',
        'alt',
        'title',
        'ariaLabel',
        'ariaRole',
        'ariaDescription',
        'ariaHidden',
        'ariaDisabled',
        'ariaExpanded',
        'ariaSelected',
      ]);

      const entries = Object.entries(obj);
      const importantEntries: [string, string][] = [];
      const otherEntries: [string, string][] = [];

      // Separate important from other attributes
      for (const [key, value] of entries) {
        const stringValue = typeof value === 'string' ? value : String(value);
        const truncatedValue =
          stringValue.length > 4096
            ? `${stringValue.slice(0, 4096)}...[truncated]`
            : stringValue;

        if (importantAttributes.has(key)) {
          importantEntries.push([key, truncatedValue]);
        } else {
          const processedValue =
            stringValue.length > 256
              ? `${stringValue.slice(0, 256)}...[truncated]`
              : stringValue;
          otherEntries.push([key, processedValue]);
        }
      }

      // Always keep all important attributes, truncate others if needed
      const maxOtherAttributes = 100 - importantEntries.length;
      const truncatedOtherEntries = otherEntries.slice(
        0,
        Math.max(0, maxOtherAttributes),
      );

      const result = Object.fromEntries([
        ...importantEntries,
        ...truncatedOtherEntries,
      ]);

      // Add truncation indicator if we truncated other entries
      if (otherEntries.length > maxOtherAttributes && maxOtherAttributes > 0) {
        result.__truncated__ = `...[${otherEntries.length - maxOtherAttributes} more entries truncated]`;
      }

      return result;
    })
    .describe(
      'A record of attributes of the element. Important attributes (class, id, style, etc.) are never truncated away. Other attributes may be truncated if there are too many total attributes.',
    ),
  textContent: z
    .string()
    .transform((val) => {
      if (val.length > 2048) {
        return `${val.slice(0, 2048)}...[truncated]`;
      }
      return val;
    })
    .describe(
      'Text content of the element. Will be truncated after 2048 characters.',
    ),
  ownProperties: z
    .record(z.string(), z.any())
    .transform((obj) => {
      // Truncate to first 500 entries
      const entries = Object.entries(obj);
      const truncatedEntries = entries.slice(0, 500);
      const result = Object.fromEntries(truncatedEntries);

      // Add truncation indicator if we truncated entries
      if (entries.length > 500) {
        result.__truncated__ = `...[${entries.length - 500} more entries truncated]`;
      }

      return result;
    })
    .describe(
      'Custom properties that the underlying object may have. Will be truncated after 500 entries. Object are only copied up to 3 levels deep, all children and levels will be truncated equally. Only elements that are serializable will be sent over',
    ),
  boundingClientRect: z
    .object({
      top: z.number(),
      left: z.number(),
      height: z.number(),
      width: z.number(),
    })
    .strict(),
  frameworkInfo: z.object({
    react: reactSelectedElementInfoSchema.nullable().optional(),
  }),
  codeMetadata: z.array(
    z.object({
      relation: z.string().max(64),
      relativePath: z.string().max(1024),
      startLine: z.number().optional(),
      content: z.string().max(100000).optional(),
    }),
  ),
});

export type SelectedElement = z.infer<typeof baseSelectedElementSchema> & {
  parent?: SelectedElement;
  children?: SelectedElement[];
};

export const selectedElementSchema = baseSelectedElementSchema.extend({
  parent: baseSelectedElementSchema.optional(),
  children: z.array(baseSelectedElementSchema).optional(),
});

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
});

export type UserMessageMetadata = z.infer<typeof metadataSchema>;
