import { useKartonProcedure } from '@/hooks/use-karton';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowRotateAnticlockwise,
} from 'nucleo-micro-bold';
import { IconMediaStopFill18 } from 'nucleo-ui-fill-18';
import type { TabState } from '@shared/karton-contracts/ui';

interface NavButtonsProps {
  tabId: string;
  tab: TabState | undefined;
}

export function NavButtons({ tabId, tab }: NavButtonsProps) {
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const stop = useKartonProcedure((p) => p.browser.stop);

  const isInternalPage = tab?.url?.startsWith('stagewise://internal/') ?? false;
  const isLoading = tab?.isLoading ?? false;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isInternalPage || !tab?.navigationHistory.canGoBack}
        onClick={() => {
          goBack(tabId);
        }}
      >
        <IconArrowLeft
          className={`size-4 ${(isInternalPage || !tab?.navigationHistory.canGoBack) && 'opacity-50'}`}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isInternalPage || !tab?.navigationHistory.canGoForward}
        onClick={() => {
          goForward(tabId);
        }}
      >
        <IconArrowRight
          className={`size-4 ${(isInternalPage || !tab?.navigationHistory.canGoForward) && 'opacity-50'}`}
        />
      </Button>
      {isLoading ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            stop(tabId);
          }}
        >
          <IconMediaStopFill18 className="size-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isInternalPage}
          onClick={() => {
            reload(tabId);
          }}
        >
          <IconArrowRotateAnticlockwise
            className={`size-4 ${(isInternalPage || !tab?.navigationHistory.canGoBack) && 'opacity-50'}`}
          />
        </Button>
      )}
    </>
  );
}
