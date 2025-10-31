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
      This is the current browser metadata of the USER.
    </description>
    <content>
      <current-url>
        ${escapeXml(browserData.currentUrl)}
      </current-url>

      <current-title>
        ${escapeXml(browserData.currentTitle)}
      </current-title>

      <viewport>
        <width>${browserData.viewport.width}</width>
        <height>${browserData.viewport.height}</height>
        <device-pixel-ratio>${browserData.viewport.dpr}</device-pixel-ratio>
      </viewport>

      <prefers-dark-mode>
        ${browserData.prefersDarkMode}
      </prefers-dark-mode>

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
