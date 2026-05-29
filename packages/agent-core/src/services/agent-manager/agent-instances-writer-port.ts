import type { UITools } from 'ai';
import type { AgentInstanceCommands } from '../../types/agent-commands';
import type { AgentMessage, AgentState } from '../../types/agent';
import type { UserMessageMetadata } from '../../types/metadata';
import type { UniversalTools } from '../../types/tools';
import type { AgentInstanceState } from '../../store/state';

/**
 * Envelope passed through {@link AgentInstancesWriterPort}. Hosts may use
 * structured `requiredModelCapabilities` (e.g. browser model settings)
 * while the core store row uses {@link AgentInstanceState}'s record shape;
 * `unknown` keeps both assignable at this seam.
 */
export type AgentInstanceWriterEnvelope<
  TUITools extends UITools = UniversalTools,
  TMessageMetadata = UserMessageMetadata,
  TState extends AgentState<
    AgentMessage<TUITools, TMessageMetadata>
  > = AgentState<AgentMessage<TUITools, TMessageMetadata>>,
> = Omit<
  AgentInstanceState<TUITools>,
  'state' | 'requiredModelCapabilities'
> & {
  state: TState;
  requiredModelCapabilities: unknown;
};

/**
 * Store-facing write surface used by {@link AgentManager}. Host controllers
 * (e.g. browser `AgentInstancesStateController`) implement this structurally.
 *
 * Generic parameters let hosts narrow `AgentState` / `AgentMessage` (branded
 * ids, host metadata) while `AgentManager` stays host-agnostic at its boundary.
 */
export interface AgentInstancesWriterPort<
  TUITools extends UITools = UniversalTools,
  TMessageMetadata = UserMessageMetadata,
  TState extends AgentState<
    AgentMessage<TUITools, TMessageMetadata>
  > = AgentState<AgentMessage<TUITools, TMessageMetadata>>,
> {
  upsertInstance(
    agentInstanceId: string,
    envelope: AgentInstanceWriterEnvelope<TUITools, TMessageMetadata, TState>,
  ): void;
  deleteInstance(agentInstanceId: string): void;
  getInstance(
    agentInstanceId: string,
  ):
    | AgentInstanceWriterEnvelope<TUITools, TMessageMetadata, TState>
    | undefined;
  buildCommands(
    agentInstanceId: string,
  ): AgentInstanceCommands<TUITools, TMessageMetadata, TState>;
  setToolApprovalMode(
    agentInstanceId: string,
    mode: TState['toolApprovalMode'],
  ): void;
}
