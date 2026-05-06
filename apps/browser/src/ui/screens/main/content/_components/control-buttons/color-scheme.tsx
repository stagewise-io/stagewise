import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { IconSunOutline18, IconMoonOutline18 } from 'nucleo-ui-outline-18';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useCallback } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';

export function ColorSchemeWidget({ tab }: { tab: TabState }) {
  const cycleColorScheme = useKartonProcedure(
    (p) => p.browser.cycleColorScheme,
  );
  const nativeColorScheme = useKartonState((s) => s.systemTheme);

  const handleClick = useCallback(() => {
    void cycleColorScheme(tab.id);
  }, [cycleColorScheme, tab.id]);

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Toggle color scheme, current: ${tab.colorScheme === 'light' ? 'Light' : tab.colorScheme === 'dark' ? 'Dark' : `System (${nativeColorScheme === 'light' ? 'Light' : 'Dark'})`}`}
          onClick={handleClick}
          className={
            'text-muted-foreground data-[active=true]:text-primary-solid data-[active=true]:hover:text-primary-solid'
          }
          data-active={tab.colorScheme !== 'system' ? 'true' : 'false'}
        >
          <div className="relative size-4">
            <IconMoonOutline18
              className={cn(
                'absolute bottom-0 left-0 transition-all duration-200 ease-out',
                tab.colorScheme === 'dark' ||
                  (tab.colorScheme === 'system' && nativeColorScheme === 'dark')
                  ? 'size-4 opacity-100'
                  : 'left-2 size-0 opacity-0',
              )}
            />
            <IconSunOutline18
              className={cn(
                'absolute bottom-0 left-0 transition-all duration-200 ease-out',
                tab.colorScheme === 'light' ||
                  (tab.colorScheme === 'system' &&
                    nativeColorScheme === 'light')
                  ? 'size-4 opacity-100'
                  : 'left-2 size-0 opacity-0',
              )}
            />
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
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
      </TooltipContent>
    </Tooltip>
  );
}
