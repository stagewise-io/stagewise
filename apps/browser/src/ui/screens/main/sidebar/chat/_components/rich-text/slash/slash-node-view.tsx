import { useMemo } from 'react';
import type { InlineNodeViewProps } from '../shared/types';
import type { SlashAttrs } from './types';
import { InlineBadgeWrapper } from '../shared';
import { cn } from '@ui/utils';

export function SlashNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as SlashAttrs;
  const isEditable = !('viewOnly' in props);

  const displayLabel = useMemo(() => {
    const name = attrs.label || attrs.id;
    return name.startsWith('/') ? name : `/${name}`;
  }, [attrs.label, attrs.id]);

  return (
    <InlineBadgeWrapper viewOnly={!isEditable} tooltipContent={displayLabel}>
      <span
        className={cn(
          'rounded-sm font-semibold text-primary-foreground',
          props.selected && 'bg-primary-foreground/15',
        )}
        contentEditable={false}
      >
        {displayLabel}
      </span>
    </InlineBadgeWrapper>
  );
}
