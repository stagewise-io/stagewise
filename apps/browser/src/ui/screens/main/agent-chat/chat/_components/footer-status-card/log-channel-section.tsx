import { Button } from '@stagewise/stage-ui/components/button';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import type { MouseEvent } from 'react';
import type { StatusCardSection } from './shared';
import { IconBugOutline18 } from 'nucleo-ui-outline-18';

export interface LogChannelDisplayEntry {
  filename: string;
  byteSize: number;
  lineCount: number;
  tailLines: string[];
}

export interface LogChannelSectionProps {
  channels: LogChannelDisplayEntry[];
  onClear?: (filename: string) => void;
}

/**
 * Try to extract a human-readable timestamp from a parsed log entry.
 * Checks common field names and formats as HH:MM:SS.
 */
function extractTime(obj: Record<string, unknown>): string | null {
  const raw = obj.ts ?? obj.timestamp ?? obj.time ?? obj.t;
  if (raw == null) return null;

  if (typeof raw === 'number') {
    // Unix seconds or milliseconds
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  return null;
}

/**
 * Extract a display message from a parsed log entry.
 */
function extractMessage(obj: Record<string, unknown>, rawLine: string): string {
  const msg = obj.message ?? obj.msg;
  if (typeof msg === 'string') return msg;
  // Fallback: truncated raw JSON
  return rawLine.length > 200 ? `${rawLine.slice(0, 200)}…` : rawLine;
}

/**
 * Returns one StatusCardSection per log channel.
 * Each section shows the channel name, entry count,
 * and a scrollable list of recent log entries.
 */
export function buildLogChannelSections({
  channels,
  onClear,
}: LogChannelSectionProps): StatusCardSection[] {
  return channels.map((channel) => {
    const channelName = channel.filename.replace(/\.jsonl$/, '');

    const entryRows =
      channel.tailLines.length > 0 ? (
        <div className="flex flex-col-reverse">
          {channel.tailLines.map((line, i) => {
            let time: string | null = null;
            let msg: string;

            try {
              const obj = JSON.parse(line) as Record<string, unknown>;
              time = extractTime(obj);
              msg = extractMessage(obj, line);
            } catch {
              msg = line.length > 200 ? `${line.slice(0, 200)}…` : line;
            }

            return (
              <div
                key={`${i}-${line.slice(0, 32)}`}
                className="flex gap-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {time && (
                  <span className="shrink-0 text-subtle-foreground">
                    {time}
                  </span>
                )}
                <span className="min-w-0 truncate">{msg}</span>
              </div>
            );
          })}
        </div>
      ) : null;

    return {
      key: `log-channel-${channel.filename}`,
      defaultOpen: false,
      scrollable: true,
      trigger: (isOpen: boolean) => (
        <div className="flex h-6 w-full flex-row items-center justify-between gap-6 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
          <div className="flex min-w-0 shrink flex-row items-center gap-2">
            <ChevronDownIcon
              className={cn(
                'size-3 shrink-0 transition-transform duration-50',
                isOpen && 'rotate-180',
              )}
            />
            <IconBugOutline18 className="size-3 shrink-0" />
            <span className="truncate">{channelName}</span>
            <span className="shrink-0 text-subtle-foreground">
              {channel.lineCount}{' '}
              {channel.lineCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          {onClear && channel.lineCount > 0 && (
            <div className="ml-auto flex shrink-0 flex-row items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 cursor-pointer"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onClear(channel.filename);
                }}
              >
                Clear log
              </Button>
            </div>
          )}
        </div>
      ),
      content: entryRows,
    };
  });
}
