import type { BrowserData } from '@stagewise/karton-contract';
import xml from 'xml';
import specialTokens from './special-tokens';

export function browserMetadataToContextSnippet(browserData: BrowserData) {
  return xml({
    [specialTokens.userMsgAttachmentXmlTag]: [
      {
        _attr: {
          type: 'browser-metadata',
        },
      },
      {
        window: {
          _attr: {
            title: browserData.currentTitle,
            url: browserData.currentUrl,
          },
        },
      },
      {
        userAgent: {
          _cdata: browserData.userAgent,
        },
      },
      {
        viewport: {
          _attr: {
            width: browserData.viewport.width,
            height: browserData.viewport.height,
            dpr: browserData.viewport.dpr,
          },
        },
      },
      {
        preferences: {
          _attr: {
            locale: browserData.locale,
            'prefers-dark-mode': browserData.prefersDarkMode,
          },
        },
      },
    ],
  });
}
