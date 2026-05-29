import type { UITools } from 'ai';
import type { UniversalTools } from '../types/tools';
import type { AgentSystemState } from './state';

/**
 * Pure factory for an empty canonical agent system state.
 *
 * Used by hosts to seed a fresh `AgentStore` at boot. Returns empty
 * `agents.instances` and `toolbox` maps — hosts populate per-agent
 * entries when hydrating agents. The factory takes no arguments to
 * guarantee package-level purity (D-KB-2): no Karton, host, or
 * environment shapes leak in.
 */
export function createInitialAgentSystemState<
  TTools extends UITools = UniversalTools,
  TQuestionField = unknown,
  TQuestionAnswer = unknown,
>(): AgentSystemState<TTools, TQuestionField, TQuestionAnswer> {
  return {
    agents: { instances: {} },
    toolbox: {},
  };
}
