import { procedure, router } from '../../trpc';
import {
  undoRequestSchema,
  type UndoExecuteResult,
  undoExecuteResultSchema,
} from './types';

export interface UndoImplementation {
  onUndoRequest: () => Promise<UndoExecuteResult>;
}

export const undoRouter = (impl?: UndoImplementation) =>
  router({
    sendUndoRequest: procedure
      .input(undoRequestSchema)
      .output(undoExecuteResultSchema)
      .mutation(
        () =>
          impl?.onUndoRequest() ??
          Promise.resolve({ success: false, error: 'Undo not supported' }),
      ),
  });
