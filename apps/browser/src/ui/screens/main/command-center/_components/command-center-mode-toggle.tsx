import {
  IconEarthSearchOutline18,
  IconGear3Outline18,
  IconMsgWritingOutline18,
} from 'nucleo-ui-outline-18';
import type { ComponentType } from 'react';
import { ShortcutKey } from '@stagewise/stage-ui/components/shortcut-key';
import { cn } from '@ui/utils';
import type { CommandCenterMode } from '../command-center-model';

type ModeDefinition = {
  mode: CommandCenterMode;
  label: string;
  Icon?: ComponentType<{ className?: string }>;
};

const modes: ModeDefinition[] = [
  { mode: 'global', label: 'All' },
  { mode: 'agents', label: 'Agents', Icon: IconMsgWritingOutline18 },
  { mode: 'browser', label: 'Browser', Icon: IconEarthSearchOutline18 },
  { mode: 'settings', label: 'Settings', Icon: IconGear3Outline18 },
];

export function CommandCenterModeToggle({
  mode,
  onModeChange,
}: {
  mode: CommandCenterMode;
  onModeChange: (mode: CommandCenterMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 text-xs">
      {modes.map(({ mode: value, label, Icon }) => {
        const isActive = value === mode;

        return (
          <button
            key={value}
            type="button"
            aria-label={`Switch to ${label} mode`}
            aria-pressed={isActive}
            onClick={() => onModeChange(value)}
            className={cn(
              'relative flex cursor-default items-center overflow-visible rounded-sm bg-background p-0 outline-none transition-colors duration-150 ease-out',
              'hover:text-foreground focus-visible:text-foreground',
              isActive ? 'text-foreground' : 'text-subtle-foreground',
            )}
          >
            {Icon ? (
              <span className="relative z-10 flex size-4 shrink-0 items-center justify-center bg-background">
                <Icon className="size-4" />
              </span>
            ) : (
              <span className="relative z-10 shrink-0 bg-background px-1">
                {label}
              </span>
            )}
            {Icon && <ModeLabel isActive={isActive} label={label} />}
          </button>
        );
      })}
      <ShortcutKey
        aria-label="Press Tab to cycle command center modes"
        className="shrink-0"
        size="xs"
      >
        Tab
      </ShortcutKey>
    </div>
  );
}

function ModeLabel({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <span
      className={cn(
        'relative z-0 ml-1 inline-grid overflow-hidden whitespace-nowrap',
        'transition-[grid-template-columns] duration-150 ease-out',
        isActive
          ? 'animate-[command-center-label-reveal-mask_150ms_ease-out_forwards] grid-cols-[1fr]'
          : 'animate-[command-center-label-conceal-mask_150ms_ease-out_forwards] grid-cols-[0fr]',
      )}
    >
      <span className="min-w-0 overflow-hidden">{label}</span>
    </span>
  );
}
