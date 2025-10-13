import type { BrowserData } from '@stagewise/karton-contract';

function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function browserMetadataToContextSnippet(
  browserData: BrowserData | undefined,
): string | null {
  if (!browserData) return null;
  return `
  <browser-metadata>
    <description>
      This is the metadata of the browser that the user is using.
    </description>
    <content>
      <current-url>
        ${escapeXml(browserData.currentUrl)}
      </current-url>

      <current-title>
        ${escapeXml(browserData.currentTitle)}
      </current-title>

      <current-zoom-level>
        ${browserData.currentZoomLevel}
      </current-zoom-level>

      <viewport-resolution>
        ${browserData.viewportResolution.width}x${browserData.viewportResolution.height}
      </viewport-resolution>

      <device-pixel-ratio>
        ${browserData.devicePixelRatio}
      </device-pixel-ratio>

      <user-agent>
        ${escapeXml(browserData.userAgent)}
      </user-agent>

      <locale>
        ${escapeXml(browserData.locale)}
      </locale>
    </content>
  </browser-metadata>
  `;
}
