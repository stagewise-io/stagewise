'use client';

import { useEffect, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { getCookieConsent, setCookieConsent } from '@/lib/cookie-consent-utils';

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (getCookieConsent() === null) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    setCookieConsent('accepted');
    setShowBanner(false);
    // Notify the PostHogProvider to upgrade to cookie persistence — no page reload needed.
    window.dispatchEvent(new Event('posthog-consent-change'));
  };

  const handleDeny = () => {
    setCookieConsent('denied');
    setShowBanner(false);
    // Notify the PostHogProvider to opt out.
    window.dispatchEvent(new Event('posthog-consent-change'));
  };

  if (!showBanner) {
    return null;
  }

  return (
    // Non-blocking: fixed overlay in the corner, page stays fully interactive.
    <div className="slide-in-from-bottom fixed right-4 bottom-4 z-50 w-full max-w-[calc(100%-2rem)] animate-in duration-300 sm:w-sm">
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-background/80 p-4 backdrop-blur-lg dark:bg-background/80">
        <div className="flex flex-col items-start gap-1">
          <h2 className="font-semibold text-base text-foreground">
            Cookie Consent
          </h2>
          <p className="text-muted-foreground text-sm">
            We use analytics cookies to understand how you use our website and
            improve your experience.
          </p>
        </div>
        <div className="flex w-full flex-row-reverse items-start justify-start gap-2">
          <Button size="sm" onClick={handleAccept}>
            Accept
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDeny}>
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}
