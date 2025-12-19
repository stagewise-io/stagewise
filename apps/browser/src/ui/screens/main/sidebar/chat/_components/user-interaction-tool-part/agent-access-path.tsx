import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import type { PickToolPart } from './index.js';
import { CheckIcon, XIcon } from 'lucide-react';
import { useKartonProcedure } from '@/hooks/use-karton';
import type { KartonServerProcedures } from '@stagewise/karton/react/client';
import type { KartonContract } from '@shared/karton-contracts/ui';

export const AskForAgentAccessPathToolPartContent = memo(
  ({
    toolPart,
    onSubmit,
    onCancel,
  }: {
    toolPart: PickToolPart<'tool-askForAgentAccessPathTool'>;
    onSubmit: (input: {
      path: string;
      type: 'askForAgentAccessPathTool';
    }) => void;
    onCancel: () => void;
  }) => {
    const repoRootResolver = useCallback(
      (p: KartonServerProcedures<KartonContract>) => {
        return p.workspace.getGitRepoRoot;
      },
      [],
    );

    const getGitRepoRoot = useKartonProcedure(repoRootResolver);

    const selectResolver = useCallback(
      (p: KartonServerProcedures<KartonContract>) =>
        p.workspace.setup.resolveRelativePathToAbsolutePath,
      [],
    );
    const resolveRelativePathToAbsolutePath =
      useKartonProcedure(selectResolver);

    const isError = useMemo(() => {
      return toolPart.state === 'output-error';
    }, [toolPart.state]);

    const isInputAvailable = useMemo(() => {
      return toolPart.state === 'input-available';
    }, [toolPart.state]);

    const isOutputAvailable = useMemo(() => {
      return toolPart.state === 'output-available';
    }, [toolPart.state]);

    const [displayPath, setDisplayPath] = useState<string | null>(null);
    const [isLoadingPath, setIsLoadingPath] = useState(false);

    useEffect(() => {
      const resolvePath = async () => {
        if (!toolPart.input?.userInput.suggestedPath) {
          setDisplayPath(null);
          return;
        }

        setIsLoadingPath(true);

        try {
          let absolutePath: string | null = null;
          if (toolPart.input?.userInput.suggestedPath === '{GIT_REPO_ROOT}') {
            absolutePath = await getGitRepoRoot();
          } else {
            absolutePath = await resolveRelativePathToAbsolutePath(
              toolPart.input?.userInput.suggestedPath,
              toolPart.input?.selectedAppPath,
            );
          }
          setDisplayPath(
            absolutePath ?? toolPart.input?.userInput.suggestedPath,
          );
        } catch {
          setDisplayPath(toolPart.input?.userInput.suggestedPath);
        } finally {
          setIsLoadingPath(false);
        }
      };

      resolvePath();
    }, [
      toolPart.input?.userInput.suggestedPath,
      resolveRelativePathToAbsolutePath,
    ]);

    return (
      <div className="flex w-full flex-col gap-2">
        {isLoadingPath ? (
          <Skeleton variant="text" size="sm" className="w-full" />
        ) : (
          <span className="mb-2 rounded-lg bg-muted-foreground/10 p-2 text-muted-foreground text-sm">
            {displayPath}
          </span>
        )}
        {(isInputAvailable || isError || isOutputAvailable) && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            {isInputAvailable && (
              <>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={onCancel}
                  disabled={isError || isOutputAvailable || isLoadingPath}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    onSubmit({
                      path: toolPart.input?.userInput.suggestedPath ?? '',
                      type: 'askForAgentAccessPathTool',
                    });
                  }}
                  disabled={
                    isError ||
                    isOutputAvailable ||
                    isLoadingPath ||
                    !displayPath
                  }
                >
                  Confirm access to this path
                </Button>
              </>
            )}
          </div>
        )}
        {isOutputAvailable && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <CheckIcon className="size-3 text-green-600" />
          </div>
        )}
        {isError && (
          <div className="flex w-full flex-row items-center justify-end gap-2">
            <XIcon className="size-3 text-rose-600" />
          </div>
        )}
      </div>
    );
  },
);
