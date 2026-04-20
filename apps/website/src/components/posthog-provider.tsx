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
    const isAccepted = consent === 'accepted';

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: '/ingest',
      ui_host: 'https://eu.posthog.com',
      capture_pageview: false, // Captured manually in PostHogPageView
      capture_pageleave: true,
      debug: process.env.NODE_ENV === 'development',

      // --- GDPR-compliant tracking strategy ---
      //
      // Cookieless mode (server-side privacy-preserving hash) is active for ALL
      // non-accepted users — both pending (no decision yet) and declined.
      // No cookies, no localStorage, no personal data → no explicit consent needed.
      //
      // The consent banner gates cookie/storage use only, NOT aggregate counting.
      //
      // Flow:
      //   pending:  cookieless hash (anonymous aggregate counts).
      //   declined: cookieless hash (same — declining means no cookies, not no
      //             analytics; the hash is irreversible and stores nothing).
      //   accepted: full persistence — cookies + localStorage for cross-session
      //             identity. Activated immediately via opt_in_capturing(); full
      //             effect guaranteed on the next page load.
      //
      // Cookieless hash: IP + user-agent hashed with a daily-rotated salt.
      // Requires "Cookieless server hash mode" enabled in PostHog project settings:
      //   Project Settings → Web analytics → Cookieless server hash mode
      //
      // 'always': force cookieless mode for all non-accepted users (both pending
      // and denied). 'on_reject' would only activate for explicitly opted-out
      // users, leaving pending visitors in full-tracking mode — wrong.
      ...(!isAccepted ? { cookieless_mode: 'always' as const } : {}),

      // Write the opt-in/out flag to a cookie so server-side middleware can read it.
      opt_out_capturing_persistence_type: 'cookie',
    });

    posthogInitialized = true;

    if (isAccepted) {
      // Ensure full persistence is active (clears any leftover opt-out cookie).
      posthog.opt_in_capturing();
    }
    // pending / declined: cookieless mode is already active — no call needed.

    // Capture the initial pageview.
    // Strip query strings for non-accepted users: query params may contain
    // personal data (e.g. tokens, email addresses) and must not be forwarded
    // to PostHog until the user has explicitly consented.
    posthog.capture('$pageview', {
      $current_url:
        window.origin +
        window.location.pathname +
        (isAccepted ? window.location.search : ''),
    });

    // React to consent changes from the cookie banner without a page reload.
    const handler = () => {
      const updated = getCookieConsent();
      if (updated === 'accepted') {
        // Attempt a live upgrade to full persistence for the current session.
        // If PostHog can't hot-swap from cookieless mode, full cookies activate
        // on the next page load (the consent cookie is already persisted).
        posthog.opt_in_capturing();
      }
      // 'denied': no action — already running in cookieless mode.
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
      // Only include query string for accepted users — same rationale as the
      // initial pageview capture above.
      const isAccepted = getCookieConsent() === 'accepted';
      let url = window.origin + pathname;
      if (isAccepted) {
        const search = searchParams.toString();
        if (search) {
          url += `?${search}`;
        }
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
