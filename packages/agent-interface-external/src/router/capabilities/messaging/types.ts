import { z } from 'zod';

/** Information about a selected element */
export const baseSelectedElementSchema = z.object({
  nodeType: z.string().min(1).max(96).describe('The node type of the element.'),
  xpath: z.string().min(1).max(1024).describe('The XPath of the element.'),
  attributes: z
    .record(z.union([z.string(), z.boolean(), z.number()]))
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
    .record(z.any())
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
  pluginInfo: z.array(
    z.object({
      pluginName: z.string().max(128),
      content: z.string().max(4096),
    }),
  ),
});

export type SelectedElement = z.infer<typeof baseSelectedElementSchema> & {
  parent?: SelectedElement;
};

export const selectedElementSchema = baseSelectedElementSchema.extend({
  parent: baseSelectedElementSchema.optional(),
});

export const userMessageMetadataSchema = z.object({
  currentUrl: z.string().max(1024).url().nullable(),
  currentTitle: z.string().max(256).nullable(),
  currentZoomLevel: z.number(),
  viewportMinScale: z.number().optional(),
  viewportMaxScale: z.number().optional(),
  viewportResolution: z.object({
    width: z.number().min(0),
    height: z.number().min(0),
  }),
  devicePixelRatio: z.number(),
  userAgent: z.string().max(1024),
  locale: z.string().max(64),
  selectedElements: z.array(selectedElementSchema),
});

export type UserMessageMetadata = z.infer<typeof userMessageMetadataSchema>;

/** Content of a user message. */
export const userMessageContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    mimeType: z.string().max(32),
    data: z.string().base64(),
  }),
]);

export type UserMessageContentItem = z.infer<
  typeof userMessageContentItemSchema
>;

/** The wrapper for user generated messages. */
export const userMessageSchema = z.object({
  id: z.string(),
  contentItems: z.array(userMessageContentItemSchema),
  createdAt: z.date(),
  metadata: userMessageMetadataSchema,
  pluginContent: z.record(z.record(userMessageContentItemSchema)),
  sentByPlugin: z.boolean(),
});

export type UserMessage = z.infer<typeof userMessageSchema>;

/** Parts of content that get's generated by the agent */
export const agentMessageContentItemPartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    mimeType: z.string().max(32),
    data: z.string().base64(),
    replacing: z.boolean(),
  }),
]);

export type AgentMessageContentItemPart = z.infer<
  typeof agentMessageContentItemPartSchema
>;

export const agentMessageUpdateSchema = z
  .object({
    messageId: z
      .string()
      .describe(
        'Make sure this stays consistent across all message parts for this message in order to properly concatenate the message parts',
      ),
    updateParts: z.array(
      z.object({
        contentIndex: z
          .number()
          .min(0)
          .describe(
            'The index of the content item in the message. This is used to concatenate the message parts properly. Make sure that the part type is consistent across all parts.',
          ),
        part: agentMessageContentItemPartSchema.describe(
          'Part that will be concatenated to the previously existing content.',
        ),
      }),
    ),
    createdAt: z.date(),
    resync: z
      .boolean()
      .describe(
        'If true, the update will be handled like a full resync of the complete message. It will thus replace the complete previous message.',
      ),
  })
  .strict()
  .describe(
    'Update for the existing message with the user. To clear a message, just send a empty message with a new ID.',
  );

export type AgentMessageUpdate = z.infer<typeof agentMessageUpdateSchema>;
