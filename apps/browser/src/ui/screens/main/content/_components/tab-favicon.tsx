import StagewiseLogo from '@/assets/stagewise/logo.png';
import type { TabState } from '@shared/karton-contracts/ui';
import { IconGlobe2Fill18 } from 'nucleo-ui-fill-18';
import { useEffect, useMemo, useState } from 'react';

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
        <img
          src={StagewiseLogo}
          alt="stagewise Logo"
          className="size-4 grayscale"
        />
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
