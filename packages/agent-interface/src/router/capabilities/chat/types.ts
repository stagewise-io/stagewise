import { z } from 'zod';
import { userMessageMetadataSchema } from '@/shared-types/metadata';

// ============================================
// Base Content Parts (aligned with Vercel AI SDK)
// ============================================

export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const filePartSchema = z.object({
  type: z.literal('file'),
  data: z.string().base64().describe('Base64 encoded dataURL'),
  filename: z.string().optional(),
  mimeType: z
    .string()
    .describe(
      'mimeType of the file, including image types like image/png, image/jpeg, etc.',
    ),
});

export const reasoningPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
});

export const toolCallPartSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.unknown()),
  runtime: z
    .enum(['cli', 'toolbar', 'backend'])
    .describe('Where the tool call should be executed'),
  requiresApproval: z
    .boolean()
    .describe('Whether user approval is required before execution'),
});

export const toolResultPartSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.unknown(),
  isError: z.boolean().optional().describe('Indicates if the tool call failed'),
});

export const toolApprovalPartSchema = z.object({
  type: z.literal('tool-approval'),
  toolCallId: z.string(),
  approved: z.boolean(),
});

// ============================================
// Message Types
// ============================================

export const userMessageSchema = z.object({
  id: z.string(),
  role: z.literal('user'),
  content: z.array(
    z.union([textPartSchema, filePartSchema, toolApprovalPartSchema]),
  ),
  metadata: userMessageMetadataSchema,
  createdAt: z.date(),
});

export const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.literal('assistant'),
  content: z.array(
    z.union([
      textPartSchema,
      filePartSchema,
      reasoningPartSchema,
      toolCallPartSchema,
      toolResultPartSchema,
    ]),
  ),
  createdAt: z.date(),
});

export const toolMessageSchema = z.object({
  id: z.string(),
  role: z.literal('tool'),
  content: z.array(toolResultPartSchema),
  createdAt: z.date(),
});

export const chatMessageSchema = z.discriminatedUnion('role', [
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
]);

export type TextPart = z.infer<typeof textPartSchema>;
export type FilePart = z.infer<typeof filePartSchema>;
export type ReasoningPart = z.infer<typeof reasoningPartSchema>;
export type ToolCallPart = z.infer<typeof toolCallPartSchema>;
export type ToolResultPart = z.infer<typeof toolResultPartSchema>;
export type ToolApprovalPart = z.infer<typeof toolApprovalPartSchema>;

export type UserMessage = z.infer<typeof userMessageSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type ToolMessage = z.infer<typeof toolMessageSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;

// ============================================
// Chat Management Types
// ============================================

export const chatSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.date(),
  messages: z.array(chatMessageSchema),
  isActive: z.boolean().describe('Whether this chat is currently active'),
});

export type Chat = z.infer<typeof chatSchema>;

export const chatListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.date(),
  isActive: z.boolean(),
  messageCount: z.number(),
});

export type ChatListItem = z.infer<typeof chatListItemSchema>;

// ============================================
// Update Types for Streaming
// ============================================

export const messagePartUpdateSchema = z.object({
  messageId: z.string(),
  partIndex: z.number().min(0),
  content: z.union([
    textPartSchema,
    filePartSchema,
    reasoningPartSchema,
    toolCallPartSchema,
    toolResultPartSchema,
    toolApprovalPartSchema,
  ]),
  updateType: z
    .enum(['create', 'append', 'replace'])
    .describe(
      'create: new part, append: append to existing text part, replace: replace entire part',
    ),
});

export type MessagePartUpdate = z.infer<typeof messagePartUpdateSchema>;

export const chatUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat-list'),
    chats: z.array(chatListItemSchema),
  }),
  z.object({
    type: z.literal('chat-created'),
    chat: chatSchema,
  }),
  z.object({
    type: z.literal('chat-deleted'),
    chatId: z.string(),
  }),
  z.object({
    type: z.literal('chat-switched'),
    chatId: z.string(),
  }),
  z.object({
    type: z.literal('chat-title-updated'),
    chatId: z.string(),
    title: z.string(),
  }),
  z.object({
    type: z.literal('message-added'),
    chatId: z.string(),
    message: chatMessageSchema,
  }),
  z.object({
    type: z.literal('message-updated'),
    chatId: z.string(),
    update: messagePartUpdateSchema,
  }),
  z.object({
    type: z.literal('messages-deleted'),
    chatId: z.string(),
    fromMessageId: z.string(),
    deletedCount: z.number(),
  }),
  z.object({
    type: z.literal('chat-full-sync'),
    chat: chatSchema,
  }),
]);

export type ChatUpdate = z.infer<typeof chatUpdateSchema>;

// ============================================
// User Actions
// ============================================

export const createChatRequestSchema = z.object({
  title: z.string().optional(),
});

export const sendMessageRequestSchema = z.object({
  chatId: z.string(),
  content: z.array(z.union([textPartSchema, filePartSchema])),
  metadata: userMessageMetadataSchema,
});

export const updateChatTitleRequestSchema = z.object({
  chatId: z.string(),
  title: z.string(),
});

export const deleteMessageAndSubsequentRequestSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
});

export const toolApprovalResponseSchema = z.object({
  toolCallId: z.string(),
  approved: z.boolean(),
});

export type CreateChatRequest = z.infer<typeof createChatRequestSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type UpdateChatTitleRequest = z.infer<
  typeof updateChatTitleRequestSchema
>;
export type DeleteMessageAndSubsequentRequest = z.infer<
  typeof deleteMessageAndSubsequentRequestSchema
>;
export type ToolApprovalResponse = z.infer<typeof toolApprovalResponseSchema>;

// ============================================
// Tool Registration (for toolbar-provided tools)
// ============================================

export const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()).describe('JSON Schema for tool input'),
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
