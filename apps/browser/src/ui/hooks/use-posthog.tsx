import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { PostHogProvider as PostHogProviderOriginal } from 'posthog-js/react';
import posthog from 'posthog-js';
import { useKartonState } from './use-karton';

let registeredSuperPropsInitKey: string | null = null;

interface PostHogProviderProps {
  children: ReactNode;
}

/**
 * Custom PostHog provider wrapper that integrates with karton state.
 * This must be used inside KartonProvider to have access to karton state.
 */
export function PostHogProvider({ children }: PostHogProviderProps) {
  const internalData = useKartonState((s) => s.internalData);
  const userAccount = useKartonState((s) => s.userAccount);
  const globalConfig = useKartonState((s) => s.globalConfig);

  // Add custom logic based on karton state
  useEffect(() => {
    if (!posthog) return;
    const telemetryLevel = globalConfig.telemetryLevel;
    if (
      telemetryLevel === 'off' ||
      (import.meta.env.NODE_ENV === 'development' &&
        import.meta.env.VITE_DISABLE_TELEMETRY === 'true')
    ) {
      try {
        posthog.stopSessionRecording();
        posthog.consent.optInOut(false);
        posthog.opt_out_capturing();
      } catch (_e) {}
      return;
    }

    // Initialize PostHog once config is available; user identity is handled
    // separately below.
    const apiKey = internalData.posthog?.apiKey;
    const apiHost = internalData.posthog?.host;
    if (apiKey) {
      posthog.init(apiKey, {
        before_send: (event) => {
          // Filter out user app errors - only capture toolbar errors
          if (!event) return null; // Reject the event
          return event;
        },
        disable_session_recording: telemetryLevel !== 'full',
        autocapture: true,
        api_host: apiHost,
        ui_host: 'https://eu.posthog.com',
        capture_pageview: false, // We capture pageviews manually
        capture_pageleave: true, // Enable pageleave capture
        debug: import.meta.env.NODE_ENV === 'development',
        session_recording: {
          compress_events: true,
          recordCrossOriginIframes: false,
          recordHeaders: false,
        },
      });
      const initKey = `${apiKey}::${apiHost ?? ''}`;
      if (registeredSuperPropsInitKey !== initKey) {
        // Register common app-level super-properties once per PostHog init
        // target so repeated effect runs do not re-register on every render.
        posthog.register({
          product: 'stagewise-browser',
          app_name: __APP_NAME__,
          app_version: __APP_VERSION__,
          app_release_channel: __APP_RELEASE_CHANNEL__,
          app_platform: __APP_PLATFORM__,
          app_arch: __APP_ARCH__,
        });
        registeredSuperPropsInitKey = initKey;
      }
      posthog.consent.optInOut(true);
      posthog.opt_in_capturing();
    }
  }, [
    globalConfig.telemetryLevel,
    internalData.posthog?.apiKey,
    internalData.posthog?.host,
  ]);

  useEffect(() => {
    const telemetryLevel = globalConfig.telemetryLevel;

    if (
      telemetryLevel === 'full' &&
      userAccount?.user?.id &&
      (!posthog._isIdentified() ||
        posthog.get_distinct_id() !== userAccount.user.id)
    ) {
      if (posthog._isIdentified()) posthog.reset();

      posthog.identify(userAccount.user.id, {
        telemetryLevel: globalConfig.telemetryLevel,
        email: userAccount.user.email,
        machineId: userAccount.machineId,
      });
      if (userAccount?.user?.id && userAccount?.machineId)
        posthog.alias(userAccount.user.id, userAccount.machineId);
    }
  }, [globalConfig, userAccount]);

  return (
    <PostHogProviderOriginal client={posthog}>
      {children}
    </PostHogProviderOriginal>
  );
}
