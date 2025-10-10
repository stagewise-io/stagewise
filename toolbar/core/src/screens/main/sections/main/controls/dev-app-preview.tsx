import { Button } from '@stagewise/stage-ui/components/button';
import {
  PlayIcon,
  Maximize2Icon,
  ProportionsIcon,
  CodeIcon,
} from 'lucide-react';

export function DevAppPreviewControls() {
  return (
    <div className="flex flex-row-reverse items-center gap-2">
      <Button variant="secondary" size="icon-md">
        <PlayIcon className="size-4" />
      </Button>
      <Button variant="secondary" size="icon-md">
        <Maximize2Icon className="size-4" />
      </Button>
      <Button variant="secondary" size="icon-md">
        <ProportionsIcon className="size-4" />
      </Button>
      <Button variant="secondary" size="icon-md">
        <CodeIcon className="size-4" />
      </Button>
    </div>
  );
}
