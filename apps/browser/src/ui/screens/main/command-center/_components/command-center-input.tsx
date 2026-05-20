import { forwardRef } from 'react';
import { IconMagnifierOutline18 } from 'nucleo-ui-outline-18';
import type { CommandCenterMode } from '../command-center-model';
import { CommandCenterModeToggle } from './command-center-mode-toggle';

export const CommandCenterInput = forwardRef<
  HTMLInputElement,
  {
    query: string;
    mode: CommandCenterMode;
    onQueryChange: (query: string) => void;
    onModeChange: (mode: CommandCenterMode) => void;
  }
>(function CommandCenterInput(
  { query, mode, onQueryChange, onModeChange },
  ref,
) {
  return (
    <div className="flex items-center gap-2 border-border-subtle border-b px-3 py-2">
      <IconMagnifierOutline18 className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search agents, tabs, settings…"
        className="min-w-0 flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-subtle-foreground"
      />
      <CommandCenterModeToggle mode={mode} onModeChange={onModeChange} />
    </div>
  );
});
