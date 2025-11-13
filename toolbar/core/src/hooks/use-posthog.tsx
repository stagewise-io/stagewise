import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { PostHogProvider as PostHogProviderOriginal } from 'posthog-js/react';
import posthog, { type CaptureResult } from 'posthog-js';
import { useKartonState } from './use-karton';

interface PostHogProviderProps {
  children: ReactNode;
}

/**
 * Determine if an error originated from the toolbar code (as opposed to the proxied user app).
 *
 * This is critical to ensure we only capture toolbar errors and not errors from the
 * user's application running in the iframe.
 */
function shouldSendEvent(event: CaptureResult): boolean {
  // Only filter exception events
  if (event?.event !== '$exception') return true; // Allow non-exception events through

  // Try to get stack trace from various possible PostHog property names
  const stackTrace =
    event.properties?.$exception_stack_trace_raw ||
    event.properties?.$exception_stacktrace ||
    event.properties?.$exception_stack ||
    event.properties?.$exception_list?.[0]?.stacktrace ||
    '';

  // Also check the exception message for context
  const exceptionMessage = event.properties?.$exception_message || '';

  // If no stack trace available, we can't determine origin - be conservative and reject
  if (!stackTrace && !exceptionMessage) return false;

  // Convert to string for easier analysis
  const stackTraceStr = String(stackTrace);
  const messageStr = String(exceptionMessage);

  // Check for iframe indicators (user's app)
  const hasIframeIndicator =
    stackTraceStr.includes('user-app-iframe') ||
    stackTraceStr.includes('about:srcdoc') ||
    messageStr.includes('user-app-iframe');

  // If it clearly has iframe indicators, reject it
  if (hasIframeIndicator) return false;

  // Send event if no iframe indicators found
  return true;
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
    if (telemetryLevel === 'off') {
      try {
        posthog.stopSessionRecording();
        posthog.consent.optInOut(false);
        posthog.opt_out_capturing();
      } catch (e) {
        console.warn('Failed to stop session recording', e);
      }
      return;
    }

    // Set user properties based on karton state
    if (userAccount?.user && internalData.posthog?.apiKey) {
      posthog.init(internalData.posthog?.apiKey, {
        before_send: (event) => {
          // Filter out user app errors - only capture toolbar errors
          if (!event || !shouldSendEvent(event)) return null; // Reject the event

          return event;
        },
        disable_session_recording: telemetryLevel !== 'full',
        autocapture: true,
        api_host: internalData.posthog?.host,
        ui_host: 'https://eu.posthog.com',
        capture_pageview: false, // We capture pageviews manually
        capture_pageleave: true, // Enable pageleave capture
        debug: process.env.NODE_ENV === 'development',
        session_recording: {
          blockSelector: '#user-app-iframe',
          compress_events: true,
          recordCrossOriginIframes: false,
          recordHeaders: false,
        },
      });
      posthog.consent.optInOut(true);
      posthog.opt_in_capturing();
    }
  }, [userAccount, globalConfig]);

  useEffect(() => {
    const telemetryLevel = globalConfig.telemetryLevel;
    if (
      telemetryLevel === 'full' &&
      userAccount?.user?.id &&
      !posthog._isIdentified()
    ) {
      posthog.identify(userAccount.user.id, {
        telemetryLevel: globalConfig.telemetryLevel,
        email: userAccount.user.email,
        machineId: userAccount.machineId,
      });
      if (userAccount?.user?.id && userAccount?.machineId)
        posthog.alias(userAccount.user.id, userAccount.machineId);
    } else if (
      telemetryLevel === 'off' ||
      userAccount?.status !== 'authenticated'
    ) {
      posthog.reset();
    }
  }, [globalConfig, userAccount]);

  return (
    <PostHogProviderOriginal client={posthog}>
      {children}
    </PostHogProviderOriginal>
  );
}
