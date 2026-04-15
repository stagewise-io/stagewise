import { useMemo } from 'react';
import type { MultiEditPart } from '.';
import { ToolPartUINotCollapsible } from '../shared/tool-part-ui-not-collapsible';
import { IconBugOutline18 } from 'nucleo-ui-outline-18';
import { stripMountPrefix } from '@ui/utils';
import { LOGS_PREFIX } from '@shared/log-ownership';

export const LogEditToolPart = ({ part }: { part: MultiEditPart }) => {
  const channelName = useMemo(() => {
    const raw = stripMountPrefix(part.input?.path ?? '');
    return raw
      .replace(new RegExp(`^${LOGS_PREFIX}/`), '')
      .replace(/\.jsonl$/, '');
  }, [part.input?.path]);

  const streamingText = `Updating ${channelName} log…`;

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 font-medium">Updated</span>
        <span className="truncate font-normal opacity-75">
          {channelName} log
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<IconBugOutline18 className="size-3 shrink-0" />}
      part={part}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
