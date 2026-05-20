import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@ui/components/ui/logo';
import { IconGlobe2Fill18 } from 'nucleo-ui-fill-18';

export function CommandCenterTabFavicon({
  faviconUrls,
  title,
  url,
}: {
  faviconUrls: string[];
  title: string;
  url: string;
}) {
  const isStagewisePage = url.startsWith('stagewise://internal/');
  const faviconUrl = useMemo(
    () => faviconUrls.find((value) => value.trim())?.trim() ?? null,
    [faviconUrls],
  );
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [faviconUrl]);

  if (isStagewisePage) {
    return (
      <span className="flex size-4 items-center justify-center p-[1px]">
        <Logo color="current" className="size-full text-primary-solid" />
      </span>
    );
  }

  if (!faviconUrl || hasError) {
    return <IconGlobe2Fill18 className="size-4 text-muted-foreground" />;
  }

  return (
    <img
      src={faviconUrl}
      alt={title ? `${title} icon` : 'Tab icon'}
      onError={() => setHasError(true)}
      className="size-4 shrink-0 rounded-[2px]"
    />
  );
}
