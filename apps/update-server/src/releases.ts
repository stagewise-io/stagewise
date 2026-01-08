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
// Example: stagewise-prerelease-1.0.0-beta.1-arm64.dmg
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
// Example: stagewise-prerelease-darwin-arm64-1.0.0-beta.1.zip
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

// For Linux packages that use different version formats and separators
// Example deb: stagewise-prerelease_1.0.0.beta.1_amd64.deb
// Example rpm: stagewise-prerelease-1.0.0.beta.1-1.x86_64.rpm
function findLinuxAsset(
  release: Release,
  appName: string,
  arch: string,
  extension: string,
): GitHubAsset | null {
  const ext = extension.toLowerCase();
  for (const asset of release.assets) {
    const name = asset.name.toLowerCase();
    if (
      name.startsWith(appName.toLowerCase()) &&
      name.endsWith(ext) &&
      name.includes(arch.toLowerCase())
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

export async function findWindowsUpdateAsset(
  channel: Channel,
  arch: string,
  currentVersion?: string,
): Promise<{ release: Release; releasesContent: string } | null> {
  const releases = await getReleases();

  for (const release of releases) {
    if (!matchesChannel(release.parsedVersion, channel)) continue;

    // Skip if not newer than current version
    if (currentVersion && !isNewerVersion(release.version, currentVersion))
      continue;

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
      // Transform relative file paths to full URLs
      const transformed = transformReleasesContent(content, release);

      return { release, releasesContent: transformed };
    } catch {
      continue;
    }
  }

  return null;
}

function transformReleasesContent(content: string, release: Release): string {
  const lines = content.trim().split('\n');
  const transformed: string[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const hash = parts[0];
    const fileName = parts[1];
    const size = parts[2] || '0';

    // Find the matching asset to get the full URL
    const asset = release.assets.find((a) => a.name === fileName);
    if (asset) {
      transformed.push(`${hash} ${asset.browser_download_url} ${size}`);
    } else {
      // Keep original if asset not found
      transformed.push(line);
    }
  }

  return transformed.join('\n');
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
