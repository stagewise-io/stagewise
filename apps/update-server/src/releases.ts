import type { Channel, LinuxFormat } from './config.js';
import { config } from './config.js';
import type { Release, GitHubAsset } from './github.js';
import { getReleases } from './github.js';
import { matchesChannel, isNewerVersion } from './version.js';

export interface AssetMatch {
  release: Release;
  asset: GitHubAsset;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAsset(release: Release, pattern: RegExp): GitHubAsset | null {
  for (const asset of release.assets) {
    if (pattern.test(asset.name)) {
      return asset;
    }
  }
  return null;
}

// Build flexible regex: appName[-suffix]-version-arch.ext
// Example: stagewise-prerelease-1.0.0-beta001-arm64.dmg
// Note: extension should be raw (e.g., '.dmg'), not pre-escaped
function buildAssetPattern(
  appName: string,
  version: string,
  arch: string,
  extension: string,
): RegExp {
  const escapedAppName = escapeRegex(appName);
  const escapedVersion = escapeRegex(version);
  const escapedArch = escapeRegex(arch);
  const escapedExt = escapeRegex(extension);

  // Match: appName[-anything]-version-arch.ext
  // The [-anything] part is optional and can be -prerelease or any other suffix
  const pattern = `^${escapedAppName}(?:-[a-zA-Z0-9]+)?-${escapedVersion}-${escapedArch}${escapedExt}$`;
  return new RegExp(pattern, 'i');
}

// Build pattern for macOS update ZIP: appName[-suffix]-darwin-arch-version.zip
// Example: stagewise-prerelease-darwin-arm64-1.0.0-beta001.zip
function buildMacOSZipPattern(
  appName: string,
  version: string,
  arch: string,
): RegExp {
  const escapedAppName = escapeRegex(appName);
  const escapedVersion = escapeRegex(version);
  const escapedArch = escapeRegex(arch);

  const pattern = `^${escapedAppName}(?:-[a-zA-Z0-9]+)?-darwin-${escapedArch}-${escapedVersion}\\.zip$`;
  return new RegExp(pattern, 'i');
}

// Arch aliases: .deb uses "amd64" while .rpm uses "x86_64" for the same arch.
// Map either name to both so requests work regardless of which convention the URL uses.
const archAliases: Record<string, string[]> = {
  x86_64: ['x86_64', 'amd64'],
  amd64: ['x86_64', 'amd64'],
};

// For Linux packages that use different version formats and separators
// Example deb: stagewise-prerelease_1.0.0.beta001_amd64.deb
// Example rpm: stagewise-prerelease-1.0.0.beta001-1.x86_64.rpm
function findLinuxAsset(
  release: Release,
  appName: string,
  arch: string,
  extension: string,
): GitHubAsset | null {
  const ext = extension.toLowerCase();
  const candidates = (archAliases[arch.toLowerCase()] ?? [arch]).map((a) =>
    a.toLowerCase(),
  );
  for (const asset of release.assets) {
    const name = asset.name.toLowerCase();
    if (
      name.startsWith(appName.toLowerCase()) &&
      name.endsWith(ext) &&
      candidates.some((a) => name.includes(a))
    ) {
      return asset;
    }
  }
  return null;
}

export async function findMacOSUpdateAsset(
  channel: Channel,
  arch: string,
  currentVersion?: string,
): Promise<AssetMatch | null> {
  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    // Skip if not newer than current version
    if (currentVersion && !isNewerVersion(release.version, currentVersion))
      continue;

    // Look for .zip file for macOS updates
    // Format: appName[-suffix]-darwin-arch-version.zip
    const pattern = buildMacOSZipPattern(config.appName, release.version, arch);
    const asset = findAsset(release, pattern);

    if (asset) {
      return { release, asset };
    }
  }

  return null;
}

export async function findMacOSDownloadAsset(
  channel: Channel,
  arch: string,
): Promise<AssetMatch | null> {
  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    // Look for .dmg file for macOS downloads (raw extension, not escaped)
    const pattern = buildAssetPattern(
      config.appName,
      release.version,
      arch,
      '.dmg',
    );
    const asset = findAsset(release, pattern);

    if (asset) {
      return { release, asset };
    }
  }

  return null;
}

/**
 * Serve the Squirrel.Windows RELEASES manifest for the latest release in
 * the requested channel.
 *
 * IMPORTANT: unlike macOS, we do NOT filter out releases that are not
 * newer than `currentVersion`. Squirrel.Windows performs its own
 * comparison: it parses the version out of each nupkg entry in the
 * RELEASES body and compares it to the installed package. If we return
 * an empty body when the client is already on the latest version,
 * Squirrel.Windows throws "Remote release File is empty or corrupted"
 * because its downloader treats any non-parseable body as an error,
 * regardless of HTTP status code.
 *
 * Therefore we always return a valid RELEASES manifest pointing at the
 * newest channel-matching release, and let Squirrel decide. When
 * installed == latest, Squirrel silently reports "no update", matching
 * the UX of the macOS code path.
 *
 * The `currentVersion` parameter is still accepted for symmetry with
 * the macOS endpoint and potential future telemetry, but is intentionally
 * unused for filtering.
 */
export async function findWindowsUpdateAsset(
  channel: Channel,
  arch: string,
  baseUrl: string,
  _currentVersion?: string,
): Promise<{ release: Release; releasesContent: string } | null> {
  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    // Look for RELEASES file
    const releasesFileName = `RELEASES-win32-${arch}`;
    const releasesAsset = release.assets.find(
      (a) => a.name === releasesFileName,
    );

    if (!releasesAsset) continue;

    // Also check that the nupkg file exists (raw extension)
    const nupkgPattern = buildAssetPattern(
      config.appName,
      release.version,
      arch,
      '-full.nupkg',
    );
    const nupkgAsset = findAsset(release, nupkgPattern);

    if (!nupkgAsset) continue;

    // Fetch and transform the RELEASES content
    try {
      const response = await fetch(releasesAsset.browser_download_url);
      if (!response.ok) continue;

      const content = await response.text();
      // Transform relative file paths to proxy URLs with arch-free filenames
      const transformed = transformReleasesContent(
        content,
        release,
        baseUrl,
        channel,
        arch,
      );

      return { release, releasesContent: transformed };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Rewrites a Squirrel.Windows RELEASES manifest so that each nupkg entry
 * points at the update server's own proxy endpoint with an arch-free filename.
 *
 * Background: the build pipeline renames nupkg files to
 * `{appName}-{version}-{arch}-full.nupkg` so that the same release can host
 * multiple architectures on GitHub. Squirrel.Windows, however, parses the
 * nupkg filename as `{id}-{version}-full.nupkg` and feeds the extracted
 * version into `System.Version.Parse`. An embedded `-{arch}` segment (e.g.
 * `-x64`) breaks that parser ("'63-x64' is not a valid version string").
 *
 * Fix: the URL surfaced to Squirrel ends with the CLEAN filename
 * (no `-{arch}`). When Squirrel requests that URL, our proxy endpoint
 * re-adds the arch suffix and 302-redirects to the real GitHub asset.
 * The payload bytes and SHA1 are unchanged.
 */
function transformReleasesContent(
  content: string,
  release: Release,
  baseUrl: string,
  channel: string,
  arch: string,
): string {
  const lines = content.trim().split('\n');
  const transformed: string[] = [];

  const archFullSuffix = `-${arch}-full.nupkg`;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const hash = parts[0];
    const fileName = parts[1];
    const size = parts[2] || '0';

    // Find the matching asset to confirm it exists on the release
    const asset = release.assets.find((a) => a.name === fileName);
    if (!asset) {
      // Keep original if asset not found
      transformed.push(line);
      continue;
    }

    // Only full-packages are renamed by the build pipeline and thus only
    // full-packages need to go through the filename-rewriting proxy.
    // Delta packages (`*-delta.nupkg`) never receive an arch suffix and
    // are served directly from GitHub to avoid an unnecessary hop — the
    // proxy route also rejects anything not ending in `-full.nupkg`.
    if (!fileName.endsWith(archFullSuffix)) {
      transformed.push(`${hash} ${asset.browser_download_url} ${size}`);
      continue;
    }

    // Strip the arch suffix from the filename we hand to Squirrel.
    // The proxy endpoint will add it back before redirecting.
    const cleanFileName = `${fileName.slice(
      0,
      -archFullSuffix.length,
    )}-full.nupkg`;

    const trimmedBase = baseUrl.replace(/\/+$/, '');
    const proxyUrl = `${trimmedBase}/update/${encodeURIComponent(
      config.appName,
    )}/${encodeURIComponent(channel)}/win/${encodeURIComponent(
      arch,
    )}/nupkg/${encodeURIComponent(cleanFileName)}`;

    transformed.push(`${hash} ${proxyUrl} ${size}`);
  }

  return transformed.join('\n');
}

/**
 * Resolve the actual GitHub-hosted nupkg asset for a given arch-free
 * filename by re-inserting the arch suffix. Used by the nupkg proxy route.
 */
export async function findNupkgAsset(
  channel: Channel,
  arch: string,
  cleanFileName: string,
): Promise<AssetMatch | null> {
  if (!cleanFileName.endsWith('-full.nupkg')) return null;

  const archAssetName = `${cleanFileName.slice(
    0,
    -'-full.nupkg'.length,
  )}-${arch}-full.nupkg`;

  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    const asset = release.assets.find((a) => a.name === archAssetName);
    if (asset) {
      return { release, asset };
    }
  }

  return null;
}

export async function findWindowsDownloadAsset(
  channel: Channel,
  arch: string,
): Promise<AssetMatch | null> {
  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    // Look for setup.exe file (raw extension)
    const pattern = buildAssetPattern(
      config.appName,
      release.version,
      arch,
      '-setup.exe',
    );
    const asset = findAsset(release, pattern);

    if (asset) {
      return { release, asset };
    }
  }

  return null;
}

export async function findLinuxDownloadAsset(
  channel: Channel,
  arch: string,
  format: LinuxFormat,
): Promise<AssetMatch | null> {
  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    const ext = format === 'deb' ? '.deb' : '.rpm';
    const asset = findLinuxAsset(release, config.appName, arch, ext);

    if (asset) {
      return { release, asset };
    }
  }

  return null;
}
