'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getCookieConsent } from '@/lib/cookie-consent-utils';

// Module-level flag — set synchronously after posthog.init() returns.
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

      // --- GDPR-compliant cookieless tracking ---
      //
      // cookieless_mode: 'on_reject' means:
      //   • Until the user decides (pending): no cookies, no localStorage, no
      //     events sent. PostHog queues internally.
      //   • On accept (opt_in_capturing): upgrades to full persistence — cookies,
      //     localStorage, cross-session identity. All queued events are flushed.
      //   • On deny (opt_out_capturing): no cookies/storage. PostHog counts this
      //     visit via a server-side privacy-preserving hash (irreversible, daily
      //     salt). No personal data stored or sent.
      //
      // Net result: ALL visitors are counted. Accepted users get full analytics.
      // Denied/pending users appear in aggregate counts only. Fully GDPR-compliant.
      //
      // Requires "Cookieless server hash mode" enabled in PostHog project settings:
      // Project Settings → Web analytics → Cookieless server hash mode
      //
      // Note: cookieless_mode + defaults are runtime config present in posthog-js
      // v1.367.0 but not yet reflected in the TypeScript config types — cast needed.
      ...({ cookieless_mode: 'on_reject', defaults: '2026-01-30' } as any),

      // Write the opt-in/out flag to a cookie so server-side middleware can read it.
      opt_out_capturing_persistence_type: 'cookie',
    });

    posthogInitialized = true;

    // Apply stored consent immediately on init.
    if (consent === 'accepted') {
      // Full persistence: cookies + localStorage + cross-session identity.
      posthog.opt_in_capturing();
    } else if (consent === 'denied') {
      // No storage, no events. PostHog counts this visit via server-side hash.
      posthog.opt_out_capturing();
    }
    // null (pending): cookieless_mode holds events until the user decides.
    // The cookie banner will call opt_in/opt_out when ready.

    // Capture the initial pageview.
    // With opt_in: fires immediately. With opt_out: suppressed. With pending:
    // PostHog queues it internally until the user decides.
    posthog.capture('$pageview', {
      $current_url:
        window.origin + window.location.pathname + window.location.search,
    });

    // React to consent changes from the cookie banner without a page reload.
    const handler = () => {
      const updated = getCookieConsent();
      if (updated === 'accepted') {
        posthog.opt_in_capturing();
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

  // Handles SPA navigations. The initial pageview is captured in PostHogProvider
  // above — isFirstRender skips the first mount to avoid double-counting.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (pathname && posthog && posthogInitialized) {
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
