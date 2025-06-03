// This hook provides an interface to fetch all kinds of metadata about the device.
// It can be used at the time of creating a finding to provide additional information about the device.

import { useCallback } from 'preact/hooks';
import UAParser from 'ua-parser-js';

type Metadata = {
  accessibility: {
    hearingImpairment: boolean;
    visionImpairment: boolean;
    prefersReducedMotion: boolean;
  };
  inputs: {
    hasMouse: boolean;
    hasTouch: boolean;
  };
  browser: {
    browser: string | null;
    version: string | null;
    engine: string | null;
  };
  viewport: {
    devicePixelRatio: number;
    resolutionX: number;
    resolutionY: number;
    viewportScale: number;
  };
  userAgent: string;
  preferences: {
    darkMode: boolean;
    locale: string;
  };
  custom?: Record<string, unknown>;
};

declare global {
  interface Window {
    __stagewise_custom_metadata_getter_list:
      | Map<
          number,
          () => Record<string, unknown> | Promise<Record<string, unknown>>
        >
      | undefined;
  }
}

export function useMetadataGetter(): () => Promise<Metadata> {
  const getMetadata = useCallback(async () => {
    const uaParser = new (UAParser as any)();
    const uaResult = uaParser.getResult();
    const newMetadata: Metadata = {
      accessibility: {
        hearingImpairment: false,
        visionImpairment: false,
        prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
      },
      inputs: {
        hasMouse: matchMedia('(any-pointer:fine)').matches,
        hasTouch: matchMedia('(any-pointer:coarse)').matches,
      },
      browser: {
        browser: uaResult.browser.name ?? null,
        version: uaResult.browser.version ?? null,
        engine: null,
      },
      viewport: {
        devicePixelRatio: window.devicePixelRatio,
        resolutionX: window.innerWidth,
        resolutionY: window.innerHeight,
        viewportScale: window.visualViewport?.scale || 1,
      },
      userAgent: window.navigator.userAgent || 'unknown',
      preferences: {
        darkMode: matchMedia('(prefers-color-scheme: dark)').matches,
        locale: window.navigator.language,
      },
    };

    try {
      if (window.__stagewise_custom_metadata_getter_list !== undefined) {
        const customMetadata: Record<string, unknown> = {};
        for (const [
          ,
          getter,
        ] of window.__stagewise_custom_metadata_getter_list) {
          try {
            const data = await getter();
            Object.assign(customMetadata, data);
          } catch {
            // no-op
          }
        }
        newMetadata.custom = customMetadata;
      }
    } catch {
      // no-op
    }

    return newMetadata;
  }, []);

  return getMetadata;
}
