import type { UserMessageMetadata } from '@stagewise/karton-contract';

export function browserMetadataToContextSnippet(
  browserData: UserMessageMetadata['browserData'] | undefined,
): string | null {
  if (!browserData) return null;
  return `
  <browser-metadata>
    <description>
      This is the metadata of the browser that the user is using.
    </description>
    <content>
      <current-url>
        ${browserData.currentUrl}
      </current-url>

      <current-title>
        ${browserData.currentTitle}
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
        ${browserData.userAgent}
      </user-agent>

      <locale>
        ${browserData.locale}
      </locale>
    </content>
  </browser-metadata>
  `;
}
