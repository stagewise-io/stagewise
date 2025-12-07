import { cn } from '@stagewise/stage-ui/lib/utils';
import { memo } from 'react';
import { getIcon } from 'seti-icons';

const setiColors: Record<string, string> = {
  blue: '#2563eb', // blue-600 - matches primary color
  grey: '#71717a', // zinc-500 - matches border/muted-foreground
  'grey-light': '#e4e4e7', // zinc-200 - lighter grey
  green: '#16a34a', // green-600 - matches success color
  orange: '#ea580c', // orange-600
  pink: '#db2777', // pink-600
  purple: '#9333ea', // purple-600
  red: '#dc2626', // red-600/rose-600 - matches error color
  white: '#ffffff',
  yellow: '#ca8a04', // yellow-600
  ignore: 'transparent',
};

export const FileIcon = memo(
  ({ filePath, className }: { filePath: string; className?: string }) => {
    const fileIcon = getIcon(filePath);
    const color = setiColors[fileIcon.color] ?? fileIcon.color ?? '#ffffff';

    return (
      <span
        className={cn(
          'seti-icon flex size-4 shrink-0 items-center justify-center',
          className,
        )}
        style={{ color }}
        dangerouslySetInnerHTML={{ __html: fileIcon.svg }}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.filePath === nextProps.filePath &&
    prevProps.className === nextProps.className,
);
