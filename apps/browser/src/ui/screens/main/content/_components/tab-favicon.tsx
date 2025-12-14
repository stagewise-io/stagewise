import type { TabState } from '@shared/karton-contracts/ui';
import { IconGlobe2Fill18 } from 'nucleo-ui-fill-18';
import { Logo } from '@/components/ui/logo';
import { useEffect, useMemo, useState } from 'react';
import { Loader2Icon } from 'lucide-react';

export function TabFavicon({ tabState }: { tabState: TabState }) {
  const isStartPage = useMemo(
    () => tabState?.url === 'ui-main',
    [tabState?.url],
  );

  const hasNoFavicon = useMemo(
    () => !tabState?.faviconUrls || tabState.faviconUrls.length === 0,
    [tabState?.faviconUrls],
  );

  const faviconUrl = useMemo(
    () => tabState?.faviconUrls?.[0]?.trim() || null,
    [tabState?.faviconUrls],
  );

  const [hasError, setHasError] = useState(false);

  // Reset error state when favicon URL changes
  useEffect(() => {
    setHasError(false);
  }, [faviconUrl]);

  const shouldShowFallback = hasNoFavicon || hasError || !faviconUrl;

  return (
    <>
      {isStartPage ? (
        <div className="flex size-4 items-center justify-center rounded-full bg-gradient-to-br from-blue-700 to-violet-700">
          <Logo color="current" className="size-1/2 text-background" />
        </div>
      ) : tabState?.isLoading ? (
        <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : shouldShowFallback ? (
        <IconGlobe2Fill18 className="size-4 text-muted-foreground" />
      ) : (
        <img
          src={faviconUrl}
          alt={tabState?.title || 'Tab icon'}
          onError={() => {
            setHasError(true);
          }}
          className="size-4 shrink-0"
        />
      )}
    </>
  );
}
