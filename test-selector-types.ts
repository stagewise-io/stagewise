// Test file to demonstrate the StateSelector type inference issue
import type { KartonContract } from './packages/karton-contract/src/index.js';
import type { StateSelector } from './packages/karton/src/react/client/karton-react-client.js';

// Mock the hook for testing
declare function useKartonState<R>(
  selector: StateSelector<KartonContract, R>,
): R;

// This should cause a TypeScript error because workspace can be null
const problematicSelector = (state: KartonContract['state']) => {
  // This should error because state.workspace can be null
  return state.workspace.agentChat.activeChatId;
};

// This should work correctly
const correctSelector: StateSelector<KartonContract, string | null> = (
  state,
) => {
  return state.workspace?.agentChat.activeChatId ?? null;
};

// This should also work correctly
const correctSelector2: StateSelector<
  KartonContract,
  { activeChatId: string | null }
> = (state) => {
  return {
    activeChatId: state.workspace?.agentChat.activeChatId ?? null,
  };
};

// Test the actual hook usage - this should now properly infer nullable types
function testHookUsage() {
  // This should now properly infer that the result can be null
  const _result1 = useKartonState((s) => s.workspace?.agentChat.activeChatId);
  // result1 should be inferred as string | null | undefined

  // This should cause a TypeScript error
  const _result2 = useKartonState((s) => s.workspace.agentChat.activeChatId);
  // This should error because we're not handling the null case
}

export {
  problematicSelector,
  correctSelector,
  correctSelector2,
  testHookUsage,
};
