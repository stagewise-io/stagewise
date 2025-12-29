import { useKartonProcedure } from '@/hooks/use-karton';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowRotateAnticlockwise,
} from 'nucleo-micro-bold';
import type { TabState } from '@shared/karton-contracts/ui';

interface NavButtonsProps {
  tabId: string;
  tab: TabState | undefined;
}

export function NavButtons({ tabId, tab }: NavButtonsProps) {
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);

  const isStartPage = tab?.url === 'ui-main';

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isStartPage || !tab?.navigationHistory.canGoBack}
        onClick={() => {
          goBack(tabId);
        }}
      >
        <IconArrowLeft
          className={`size-4 ${!isStartPage && tab?.navigationHistory.canGoBack ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isStartPage || !tab?.navigationHistory.canGoForward}
        onClick={() => {
          goForward(tabId);
        }}
      >
        <IconArrowRight
          className={`size-4 ${!isStartPage && tab?.navigationHistory.canGoForward ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isStartPage}
        onClick={() => {
          reload(tabId);
        }}
      >
        <IconArrowRotateAnticlockwise
          className={`size-4 ${!isStartPage ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
        />
      </Button>
    </>
  );
}
