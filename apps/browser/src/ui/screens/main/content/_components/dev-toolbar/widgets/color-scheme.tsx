import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { IconSunFill18, IconMoonFill18 } from 'nucleo-ui-fill-18';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useCallback } from 'react';
import { ToggleButton } from '../primitives';
import type { WidgetProps } from './types';

export function ColorSchemeWidget({ tab, sortableProps }: WidgetProps) {
  const { isDragging, dragHandleProps } = sortableProps;
  const cycleColorScheme = useKartonProcedure(
    (p) => p.browser.cycleColorScheme,
  );
  const nativeColorScheme = useKartonState((s) => s.systemTheme);

  const handleClick = useCallback(() => {
    void cycleColorScheme(tab.id);
  }, [cycleColorScheme, tab.id]);

  return (
    <ToggleButton
      ariaLabel="Toggle color scheme"
      tooltipContent={
        <span>
          Toggle color scheme
          <br />
          <span className="text-muted-foreground text-xs">
            Current:{' '}
            {tab.colorScheme === 'light'
              ? 'Light'
              : tab.colorScheme === 'dark'
                ? 'Dark'
                : `System (${nativeColorScheme === 'light' ? 'Light' : 'Dark'})`}
          </span>
        </span>
      }
      icon={
        <div className="relative size-5">
          <IconMoonFill18
            className={cn(
              'absolute bottom-0 left-0 transition-all duration-200 ease-out',
              tab.colorScheme === 'light' && '-rotate-180 size-0',
              tab.colorScheme === 'dark' && 'size-5',
              tab.colorScheme === 'system' &&
                (nativeColorScheme === 'dark'
                  ? 'size-3.5'
                  : 'size-2.5 opacity-40'),
            )}
          />
          <IconSunFill18
            className={cn(
              'absolute top-0 right-0 transition-all duration-200 ease-out',
              tab.colorScheme === 'light' && 'size-5',
              tab.colorScheme === 'dark' && 'top-5 right-1 size-0 rotate-30',
              tab.colorScheme === 'system' &&
                (nativeColorScheme === 'light'
                  ? 'size-3.5 rotate-45'
                  : 'size-2.5 rotate-45 opacity-40'),
            )}
          />
        </div>
      }
      onClick={handleClick}
      active={tab.colorScheme !== 'system'}
      dragHandleProps={dragHandleProps}
      isDragging={isDragging}
    />
  );
}
