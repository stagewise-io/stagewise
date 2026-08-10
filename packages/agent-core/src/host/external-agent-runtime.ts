import type { ToolApprovalResponse } from 'ai';
import type { AgentMessage, AgentState } from '../types/agent';
import type { UtilityModelEntry } from './models';

export interface ExternalAgentRuntimeContext {
  instanceId: string;
  getState(): AgentState;
  upsertAssistantMessage(message: AgentMessage & { role: 'assistant' }): void;
  notifyApprovalRequested(toolCallId: string, toolName: string): void;
  recordUsage(totalTokens: number, contextWindowSize?: number): void;
  getMountedPaths(): ReadonlyMap<string, string>;
  writeAttachment(attachmentId: string, data: Uint8Array): Promise<void>;
  requestUserInput(input: unknown): Promise<unknown>;
  cancelUserInput(): void;
}

export interface ExternalAgentRuntime {
  handles(selection: UtilityModelEntry): boolean;
  runTurn(args: {
    selection: UtilityModelEntry;
    userMessages: Array<AgentMessage & { role: 'user' }>;
    approvalMode: string;
  }): Promise<void>;
  respondToApproval(response: ToolApprovalResponse): Promise<boolean>;
  stop(): Promise<void>;
  resetThread?(): Promise<void>;
  teardown(): Promise<void>;
}

export type ExternalAgentRuntimeFactory = (
  context: ExternalAgentRuntimeContext,
) => ExternalAgentRuntime | undefined;
