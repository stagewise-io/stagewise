'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getCookieConsent } from '@/lib/cookie-consent-utils';

// Module-level flag — set synchronously after posthog.init() returns.
// Avoids depending on posthog.__loaded (private API, may break without notice).
let posthogInitialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (posthogInitialized) return;

    const consent = getCookieConsent();

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: '/ingest',
      ui_host: 'https://eu.posthog.com',
      capture_pageview: false, // Captured manually in PostHogPageView
      capture_pageleave: true,
      debug: process.env.NODE_ENV === 'development',

      // --- Consent-aware persistence ---
      // Write the opt-out flag to a cookie (not localStorage) so that
      // server-side middleware can read it too.
      opt_out_capturing_persistence_type: 'cookie',
      // Start fully opted out by default — no events, no cookies, no storage.
      // We explicitly opt in/out below based on stored consent.
      opt_out_capturing_by_default: true,
      // Also disable all persistence (distinct ID, session, etc.) by default.
      // Only enabled once the user accepts.
      opt_out_persistence_by_default: true,
    });

    posthogInitialized = true;

    // Apply the correct state based on stored consent.
    if (consent === 'accepted') {
      // User previously accepted: opt in and capture this pageview.
      posthog.opt_in_capturing();
      posthog.capture('$pageview', {
        $current_url:
          window.origin + window.location.pathname + window.location.search,
      });
    }
    // For 'denied' and null (undecided), opt_out_capturing_by_default: true
    // already ensures nothing is sent. No further action needed.

    // React to consent changes from the cookie banner without a page reload.
    const handler = () => {
      const updated = getCookieConsent();
      if (updated === 'accepted') {
        posthog.opt_in_capturing();
        // Capture the pageview that was missed while the user was deciding.
        posthog.capture('$pageview', {
          $current_url:
            window.origin + window.location.pathname + window.location.search,
        });
      } else if (updated === 'denied') {
        posthog.opt_out_capturing();
        posthog.reset();
      }
    };

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

  // Tracks SPA navigations. The initial pageview is handled in PostHogProvider's
  // useEffect (parent, runs after this child). isFirstRender skips the first
  // mount so we don't double-count with the parent's capture.
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
