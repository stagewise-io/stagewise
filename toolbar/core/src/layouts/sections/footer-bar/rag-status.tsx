import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { DatabaseIcon } from 'lucide-react';
import {
  Progress,
  ProgressTrack,
} from '@stagewise/stage-ui/components/progress';
import { useKartonState } from '@/hooks/use-karton';

export function RagStatusArea() {
  const ragStatus = useKartonState((s) => s.workspace?.rag);

  if (!ragStatus) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          variant="secondary"
          size={ragStatus.isIndexing ? 'xs' : 'icon-xs'}
          className="rounded-full"
        >
          <DatabaseIcon className="size-3" />
          {ragStatus.isIndexing && (
            <Progress
              className="w-16"
              value={ragStatus.indexProgress}
              min={0}
              max={ragStatus.indexTotal}
            >
              <ProgressTrack slim busy variant="normal" />
            </Progress>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>
          {ragStatus.isIndexing ? 'Indexing codebase...' : 'Indexed codebase'}
        </PopoverTitle>
        <PopoverDescription>
          {ragStatus.isIndexing
            ? `Indexed ${ragStatus.indexProgress} of ${ragStatus.indexTotal} files`
            : `Indexed ${ragStatus.indexTotal} files`}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
