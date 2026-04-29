import { useMemo } from 'react';
import type { ShellSessionInfo } from '@shared/karton-contracts/pages-api';
import { OwnershipCapsule, type ShellOwnership } from './ownership-capsule';

interface TerminalHeaderProps {
  info: ShellSessionInfo | null;
  sessionId: string;
  ownership: ShellOwnership;
}

const PATH_SEP_RE = /[/\\]/;

export function TerminalHeader({
  info,
  sessionId,
  ownership,
}: TerminalHeaderProps) {
  const cwdSegments = useMemo(() => splitCwd(info?.cwd ?? ''), [info?.cwd]);

  return (
    <header className="flex shrink-0 flex-col gap-0.5 border-border-subtle border-b bg-background px-3 py-2 dark:bg-surface-1">
      <div className="flex flex-row items-center gap-2">
        <Crumbs segments={cwdSegments} />
        <BulletDot />
        <span className="font-mono text-[11px] text-muted-foreground tracking-tight">
          {info?.shellType ?? 'shell'}
        </span>
        {/* Only show the pill when something non-default is going on —
            the cursor + writability already signal "user in control". */}
        {ownership !== 'user' && (
          <div className="ml-auto">
            <OwnershipCapsule ownership={ownership} exitCode={info?.exitCode} />
          </div>
        )}
      </div>
      <div className="flex flex-row items-center gap-2 text-[10px] text-subtle-foreground">
        <span className="font-mono uppercase tracking-[0.08em]">session</span>
        <span className="font-mono">{sessionId.slice(0, 8)}</span>
        {info && (
          <>
            <BulletDot small />
            <span>
              opened{' '}
              <time dateTime={new Date(info.createdAt).toISOString()}>
                {formatTime(info.createdAt)}
              </time>
            </span>
          </>
        )}
      </div>
    </header>
  );
}

function Crumbs({ segments }: { segments: string[] }) {
  if (segments.length === 0) {
    return <span className="text-muted-foreground text-xs">workspace</span>;
  }
  const last = segments[segments.length - 1];
  // Cumulative paths as keys — repeated segment names (e.g. `src/apps/src`) need unique ones.
  const rest = segments.slice(0, -1).map((seg, i, arr) => ({
    label: seg,
    path: arr.slice(0, i + 1).join('/'),
  }));
  return (
    <div className="flex min-w-0 flex-row items-center gap-1 text-xs">
      {rest.map((item) => (
        <span key={item.path} className="flex flex-row items-center gap-1">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="text-border" aria-hidden>
            /
          </span>
        </span>
      ))}
      <span className="truncate font-medium text-foreground">{last}</span>
    </div>
  );
}

function BulletDot({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={small ? 'text-[8px] text-border' : 'text-border text-xs'}
    >
      ·
    </span>
  );
}

function splitCwd(cwd: string): string[] {
  if (!cwd) return [];
  const segments = cwd.split(PATH_SEP_RE).filter(Boolean);
  // Trim to the last 3 segments so the header stays readable.
  return segments.slice(-3);
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
