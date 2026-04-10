'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getCookieConsent } from '@/lib/cookie-consent-utils';

// Module-level flag — set synchronously after posthog.init() returns.
// Avoids depending on posthog.__loaded (private API, may break without notice).
let posthogInitialized = false;

/**
 * Applies the correct PostHog capture mode based on the current consent status.
 *
 * - 'accepted' → opt in with cookie persistence (full tracking)
 * - 'denied'   → opt out (no capture, no storage)
 * - null       → memory-only mode (anonymous session, no cookies — GDPR safe)
 */
function applyConsent(consent: 'accepted' | 'denied' | null) {
  if (consent === 'accepted') {
    posthog.set_config({ persistence: 'cookie' });
    posthog.opt_in_capturing();
  } else if (consent === 'denied') {
    posthog.opt_out_capturing();
    posthog.reset();
  }
  // null → do nothing; posthog already runs in memory-only mode
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    const consent = getCookieConsent();

    // Always initialize — memory persistence means no cookies are written,
    // so this is GDPR compliant even without consent.
    if (!posthogInitialized) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: '/ingest',
        ui_host: 'https://eu.posthog.com',
        capture_pageview: false, // Captured manually in PostHogPageView
        capture_pageleave: true,
        debug: process.env.NODE_ENV === 'development',
        // Start with memory — no cookies written until the user accepts.
        persistence: 'memory',
        // opt_out_capturing_by_default is intentionally omitted:
        // applyConsent() below is the single source of truth for opt-out state.
        // Using opt_out_capturing_by_default would write to localStorage as a
        // side effect, bypassing our memory-only persistence setup.
      });
      posthogInitialized = true;
    }

    // Apply the stored consent state immediately on mount.
    applyConsent(consent);

    // Capture the initial pageview here — in the parent — rather than relying
    // on PostHogPageView's child effect. React runs child effects before parent
    // effects, so by the time PostHogPageView fires on first mount, __loaded is
    // still false and its guard blocks the capture. The child's effect correctly
    // handles all subsequent navigation changes (pathname/searchParams deps).
    if (!posthog.has_opted_out_capturing()) {
      posthog.capture('$pageview', {
        $current_url:
          window.origin + window.location.pathname + window.location.search,
      });
    }

    // React to consent changes triggered by the cookie banner (no page reload needed).
    const handler = () => applyConsent(getCookieConsent());
    window.addEventListener('posthog-consent-change', handler);
    return () => window.removeEventListener('posthog-consent-change', handler);
  }, []);

  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PHProvider>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  // Tracks pageviews on navigation. The initial pageview on first mount is
  // intentionally handled by the parent PostHogProvider's useEffect (which runs
  // after this child effect), so we skip the first render via isFirstRender.
  // Subsequent pathname/searchParams changes re-run this effect once
  // posthogInitialized is true, so SPA navigation tracking works correctly.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (
      pathname &&
      posthog &&
      posthogInitialized &&
      !posthog.has_opted_out_capturing()
    ) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) {
        url += `?${search}`;
      }
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}

function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}
