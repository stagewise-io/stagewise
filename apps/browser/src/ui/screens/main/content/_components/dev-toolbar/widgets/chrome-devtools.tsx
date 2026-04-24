import { useKartonProcedure } from '@ui/hooks/use-karton';
// import { IconGoogleChrome } from 'nucleo-social-media';
import { ToggleButton } from '../primitives';
import type { WidgetProps } from './types';
import { IconSquareCodeFillDuo18 } from 'nucleo-ui-fill-duo-18';

export function ChromeDevToolsWidget({ tab, sortableProps }: WidgetProps) {
  const { isDragging, dragHandleProps } = sortableProps;
  const toggleChromeDevTools = useKartonProcedure(
    (p) => p.browser.devTools.chrome.toggle,
  );

  return (
    <ToggleButton
      ariaLabel="Show Chrome DevTools"
      icon={<IconSquareCodeFillDuo18 className="size-5" />}
      onClick={() => toggleChromeDevTools(tab.id)}
      active={tab.devTools.chromeOpen}
      dragHandleProps={dragHandleProps}
      isDragging={isDragging}
    />
  );
}
