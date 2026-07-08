'use client';

import { useState, useEffect } from 'react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { IconDownload4FillDuo18 } from '@stagewise/icons';
import { cn } from '@stagewise/stage-ui/lib/utils';

export function DownloadButtons({ className }: { className?: string }) {
  const [userOS, setUserOS] = useState<string>('your OS');
  const [downloadUrl, setDownloadUrl] = useState<string>('#');
  const [isMobile, setIsMobile] = useState(false);
  const [isOsSupported, setIsOsSupported] = useState(true);
  const [hasDetected, setHasDetected] = useState(false);

  useEffect(() => {
    const platform =
      (
        navigator as Navigator & {
          userAgentData?: { platform?: string };
        }
      ).userAgentData?.platform?.toLowerCase() ?? '';
    const userAgent = navigator.userAgent.toLowerCase();

    const mobileCheck =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent,
      );
    setIsMobile(mobileCheck);

    if (platform.includes('mac') || userAgent.includes('mac')) {
      setUserOS('macOS');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/macos/arm64',
      );
    } else if (platform.includes('win') || userAgent.includes('win')) {
      setUserOS('Windows');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/win/x64',
      );
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      setUserOS('Linux');
      setDownloadUrl(
        'https://dl.stagewise.io/download/stagewise/release/linux/deb/x86_64',
      );
    } else {
      setIsOsSupported(false);
    }
    setHasDetected(true);
  }, []);

  if (!hasDetected) {
    return (
      <Button size="lg" variant="primary" disabled className={className}>
        Loading...
      </Button>
    );
  }

  if (isMobile) {
    return (
      <Button size="lg" variant="primary" disabled className={className}>
        Download on Desktop
      </Button>
    );
  }

  if (!isOsSupported) {
    return (
      <Button size="lg" variant="primary" disabled className={className}>
        OS not supported
      </Button>
    );
  }

  return (
    <a
      href={downloadUrl}
      className={cn(
        buttonVariants({ size: 'lg', variant: 'primary' }),
        className,
      )}
    >
      Download for {userOS}
      <IconDownload4FillDuo18 className="size-4" />
    </a>
  );
}
