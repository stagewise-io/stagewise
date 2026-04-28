import { cn } from '@ui/utils';

export type ShellOwnership = 'user' | 'agent' | 'exited';

interface OwnershipCapsuleProps {
  ownership: ShellOwnership;
  exitCode?: number | null;
}

const LABELS: Record<ShellOwnership, string> = {
  user: 'you have control',
  agent: 'agent driving',
  exited: 'session ended',
};

/** State pill with color + glyph so it reads in monochrome too. */
export function OwnershipCapsule({
  ownership,
  exitCode,
}: OwnershipCapsuleProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-200',
        ownership === 'user' &&
          'border-primary-foreground/60 text-primary-foreground',
        ownership === 'agent' &&
          'border-primary-foreground/30 text-primary-foreground',
        ownership === 'exited' && 'border-border-subtle text-subtle-foreground',
      )}
    >
      <Glyph ownership={ownership} />
      <span>{LABELS[ownership]}</span>
      {ownership === 'exited' && typeof exitCode === 'number' && (
        <span className="text-subtle-foreground/70">code {exitCode}</span>
      )}
    </span>
  );
}

function Glyph({ ownership }: { ownership: ShellOwnership }) {
  const className = cn(
    'inline-block h-2 w-2 shrink-0',
    ownership === 'agent' && 'animate-[pulse_1600ms_ease-in-out_infinite]',
  );
  if (ownership === 'user') {
    return (
      <svg
        viewBox="0 0 8 8"
        className={className}
        aria-hidden
        focusable="false"
      >
        <circle cx="4" cy="4" r="3" fill="currentColor" />
      </svg>
    );
  }
  if (ownership === 'agent') {
    return (
      <svg
        viewBox="0 0 8 8"
        className={className}
        aria-hidden
        focusable="false"
      >
        <path d="M4 1 a3 3 0 0 1 0 6 z" fill="currentColor" />
        <circle
          cx="4"
          cy="4"
          r="3"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 8 8" className={className} aria-hidden focusable="false">
      <path
        d="M2 2 L6 6 M6 2 L2 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
