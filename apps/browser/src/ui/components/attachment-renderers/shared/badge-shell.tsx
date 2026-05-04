import { useMemo, type ReactNode } from 'react';
import type { BadgeProps } from '../types';
import {
  truncateLabel,
  InlineBadge,
  InlineBadgeWrapper,
} from '@ui/screens/main/agent-chat/chat/_components/rich-text/shared';

interface BadgeShellProps extends BadgeProps {
  icon: ReactNode;
  previewContent?: ReactNode;
  tooltipContent?: ReactNode;
}

export function BadgeShell({
  attachmentId,
  fileName,
  icon,
  previewContent,
  tooltipContent,
  viewOnly,
  selected,
  onDelete,
}: BadgeShellProps) {
  const displayLabel = useMemo(
    () => truncateLabel(fileName, attachmentId),
    [fileName, attachmentId],
  );

  return (
    <InlineBadgeWrapper
      viewOnly={viewOnly}
      previewContent={previewContent}
      tooltipContent={tooltipContent}
    >
      <InlineBadge
        icon={icon}
        label={displayLabel}
        selected={selected ?? false}
        isEditable={!viewOnly}
        onDelete={onDelete ?? (() => {})}
      />
    </InlineBadgeWrapper>
  );
}
