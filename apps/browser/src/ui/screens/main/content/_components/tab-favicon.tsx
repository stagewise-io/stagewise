import type { TabState } from '@shared/karton-contracts/ui';
import {
  IconArrowsOppositeDirectionXOutline18,
  IconBoxSparkleOutline18,
  IconEarthOutline18,
  IconHelpChatOutline18,
  IconSquareTerminalOutline18,
} from '@stagewise/icons';
import { Logo } from '@ui/components/ui/logo';
import { useEffect, useMemo, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { FileIcon } from '@ui/components/file-icon';

export function TabFavicon({ tabState }: { tabState: TabState }) {
  const isAppPreview = useMemo(
    () => tabState?.url?.startsWith('stagewise://internal/preview/') ?? false,
    [tabState?.url],
  );

  const isStagewisePage = useMemo(
    () => tabState?.url?.startsWith('stagewise://internal/') ?? false,
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
      {isAppPreview ? (
        <IconBoxSparkleOutline18 className="size-4 text-primary-solid" />
      ) : isStagewisePage ? (
        <div className="flex size-4 items-center justify-center p-[1px]">
          <Logo color="current" className="size-full text-primary-solid" />
        </div>
      ) : tabState?.type === 'file' && tabState.file?.showDiff ? (
        <IconArrowsOppositeDirectionXOutline18 className="size-4 text-muted-foreground" />
      ) : tabState?.type === 'file' && tabState.file ? (
        <FileIcon filePath={tabState.file.relativePath} className="size-4" />
      ) : tabState?.type === 'side-chat' ? (
        <IconHelpChatOutline18 className="size-4 text-muted-foreground" />
      ) : tabState?.isLoading ? (
        <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : shouldShowFallback ? (
        tabState?.type === 'terminal' ? (
          <IconSquareTerminalOutline18 className="size-4 text-muted-foreground" />
        ) : (
          <IconEarthOutline18 className="size-4 text-muted-foreground" />
        )
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
