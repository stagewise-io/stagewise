/**
 * Scenario-based agent lifecycle decorators for Storybook
 *
 * These decorators simulate complete agent message lifecycles with realistic timing
 * and multi-phase interactions.
 *
 * @example
 * ```tsx
 * import { withFileEditScenario } from './.storybook/decorators/scenarios';
 *
 * export const FileEdit: Story = {
 *   decorators: [withFileEditScenario],
 *   parameters: {
 *     fileEditScenario: {
 *       userMessage: 'Add a loading state',
 *       thinkingText: 'I need to add an isLoading prop...',
 *       targetFile: 'Button.tsx',
 *       beforeContent: '...',
 *       afterContent: '...',
 *       responseText: "I've added the loading state.",
 *     }
 *   }
 * };
 * ```
 */

// Core utilities
export { TimelineExecutor } from './timeline-engine';
export type {
  TimelineEvent,
  AddMessageEvent,
  UpdateMessagePartEvent,
  StreamTextPartEvent,
  StreamReasoningPartEvent,
  UpdateToolStateEvent,
  StreamToolInputFieldEvent,
  SetIsWorkingEvent,
  WaitEvent,
} from './timeline-engine';

export {
  REALISTIC_TIMING,
  generateId,
  getRandomDuration,
  splitIntoChunks,
  setNestedField,
  createTextPart,
  createReasoningPart,
  createFilePart,
  createUserMessage,
  createAssistantMessage,
  createReadFileToolPart,
  createOverwriteFileToolPart,
  createMultiEditToolPart,
  createDeleteFileToolPart,
  createListFilesToolPart,
  createGlobToolPart,
  createGrepSearchToolPart,
  updateMessageInState,
  addMessageToState,
  setIsWorkingInState,
} from './shared-utilities';

// Scenario decorators
export { withSimpleResponseScenario } from './with-simple-response-scenario';
export type { SimpleResponseScenarioConfig } from './with-simple-response-scenario';

export { withFileReadingScenario } from './with-file-reading-scenario';
export type { FileReadingScenarioConfig } from './with-file-reading-scenario';

export { withFileEditScenario } from './with-file-edit-scenario';
export type { FileEditScenarioConfig } from './with-file-edit-scenario';

export { withMultiFileEditScenario } from './with-multi-file-edit-scenario';
export type { MultiFileEditScenarioConfig } from './with-multi-file-edit-scenario';

export { withExplorationScenario } from './with-exploration-scenario';
export type { ExplorationScenarioConfig } from './with-exploration-scenario';

export { withErrorRecoveryScenario } from './with-error-recovery-scenario';
export type { ErrorRecoveryScenarioConfig } from './with-error-recovery-scenario';

export { withComplexRefactoringScenario } from './with-complex-refactoring-scenario';
export type { ComplexRefactoringScenarioConfig } from './with-complex-refactoring-scenario';

export { withDeleteFileScenario } from './with-delete-file-scenario';
export type { DeleteFileScenarioConfig } from './with-delete-file-scenario';

export { withListFilesScenario } from './with-list-files-scenario';
export type { ListFilesScenarioConfig } from './with-list-files-scenario';

export { withGlobScenario } from './with-glob-scenario';
export type { GlobScenarioConfig } from './with-glob-scenario';

export { withGrepSearchScenario } from './with-grep-search-scenario';
export type { GrepSearchScenarioConfig } from './with-grep-search-scenario';
