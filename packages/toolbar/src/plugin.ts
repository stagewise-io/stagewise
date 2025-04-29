import { type ZodSchema } from "zod";

interface MCPResponse {
  type: "text" | "image" | "video" | "audio" | "file";
  content: string;
}

export interface MCPTool {
  name: string; // Unique identifier for the tool
  description?: string; // Human-readable description
  inputSchema: object; // JSON Schema for the tool's parameters
  annotations?: {
    // Optional hints about tool behavior
    title?: string; // Human-readable title for the tool
    readOnlyHint?: boolean; // If true, the tool does not modify its environment
    destructiveHint?: boolean; // If true, the tool may perform destructive updates
    idempotentHint?: boolean; // If true, repeated calls with same args have no additional effect
    openWorldHint?: boolean; // If true, tool interacts with external entities
  };
}

export interface UserMessage {
  id: string;
  text: string;
  contextElements: HTMLElement[];
}

export interface ToolbarTool {
  name: string;
  description: string;
  action: () => void;
}

export interface ToolbarPlugin {
  name: string;
  description: string;
  mcpTools: MCPTool[];
  shortInfoForPrompt: (prompt: UserMessage) => string; // Up to 200 characters of information that's gets passed in on a user prompt.
  tools: ToolbarTool[];
}
