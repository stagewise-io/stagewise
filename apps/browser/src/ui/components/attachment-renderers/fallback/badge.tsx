import { FileIcon } from '@ui/components/file-icon';
import type { BadgeProps } from '../types';
import { BadgeShell } from '../shared/badge-shell';

export function FallbackBadge(props: BadgeProps) {
  return (
    <BadgeShell
      {...props}
      icon={<FileIcon filePath={props.fileName} className="-m-0.5 size-4" />}
      tooltipContent={<span>{props.fileName}</span>}
    />
  );
}
