import { Router, type Request, type Response } from 'express';
import type { Channel, LinuxFormat } from './config.js';
import { config } from './config.js';
import {
  findMacOSUpdateAsset,
  findMacOSDownloadAsset,
  findWindowsUpdateAsset,
  findWindowsDownloadAsset,
  findLinuxDownloadAsset,
  findNupkgAsset,
} from './releases.js';

/**
 * Determine the public-facing base URL of this update server.
 *
 * In production PUBLIC_URL MUST be set — enforced at startup by
 * `validateConfig()`, so this function cannot be reached in production
 * without it. We never trust proxy-forwarded headers
 * (X-Forwarded-Host / X-Forwarded-Proto) for URL construction, because
 * those can be spoofed by any HTTP client when the app is not configured
 * with an explicit `trust proxy` chain. A spoofed host would end up
 * embedded in RELEASES manifests and could poison shared caches or
 * redirect Squirrel clients at attacker-controlled hosts.
 *
 * When PUBLIC_URL is not configured (dev only) we fall back to Express's
 * own `req.protocol` / `req.get('host')`, which already respect the app's
 * `trust proxy` setting when one is configured.
 */
function resolveBaseUrl(req: Request): string {
  if (config.publicUrl) return config.publicUrl;

  // Defense-in-depth: even though validateConfig() refuses to start a
  // production server without PUBLIC_URL, double-check here so an
  // accidental mutation of isProduction (tests, etc.) can't leak
  // request-derived URLs into RELEASES manifests.
  if (config.isProduction) {
    throw new Error(
      'resolveBaseUrl: PUBLIC_URL is required in production but was not configured',
    );
  }

  const host = req.get('host');
  if (!host) {
    throw new Error(
      'resolveBaseUrl: cannot determine base URL — PUBLIC_URL is not configured and the request has no Host header',
    );
  }
  return `${req.protocol}://${host}`;
}

const router = Router();

function isValidChannel(channel: string): channel is Channel {
  return channel === 'release' || channel === 'beta' || channel === 'alpha';
}

function isValidLinuxFormat(format: string): format is LinuxFormat {
  return format === 'deb' || format === 'rpm';
}

function truncateNotes(notes: string, maxLength = 512): string {
  if (notes.length <= maxLength) return notes;
  return `${notes.slice(0, maxLength).trim()}...`;
}

// macOS update endpoint
// GET /update/:appName/:channel/macos/:arch/:version
router.get(
  '/update/:appName/:channel/macos/:arch/:version',
  async (req: Request, res: Response) => {
    const { appName, channel, arch, version } = req.params;

    if (appName !== config.appName) {
      res.status(404).send('App not found');
      return;
    }

    if (!isValidChannel(channel)) {
      res.status(400).send('Invalid channel');
      return;
    }

    try {
      const match = await findMacOSUpdateAsset(channel, arch, version);

      if (!match) {
        res.status(204).send();
        return;
      }

      const response = {
        url: match.asset.browser_download_url,
        name: match.release.version,
        notes: truncateNotes(match.release.notes),
        pub_date: match.release.publishedAt,
      };

      res.setHeader('Content-Type', 'application/json');
      res.json(response);
    } catch (error) {
      console.error('Error in macOS update endpoint:', error);
      res.status(500).send('Internal server error');
    }
  },
);

// Windows update endpoint
// GET /update/:appName/:channel/win/:arch/:version/RELEASES
router.get(
  '/update/:appName/:channel/win/:arch/:version/RELEASES',
  async (req: Request, res: Response) => {
    const { appName, channel, arch, version } = req.params;

    if (appName !== config.appName) {
      res.status(404).send('App not found');
      return;
    }

    if (!isValidChannel(channel)) {
      res.status(400).send('Invalid channel');
      return;
    }

    try {
      const baseUrl = resolveBaseUrl(req);
      const match = await findWindowsUpdateAsset(
        channel,
        arch,
        baseUrl,
        version,
      );

      if (!match) {
        res.setHeader('Content-Type', 'text/plain');
        res.send('');
        return;
      }

      res.setHeader('Content-Type', 'text/plain');
      res.send(match.releasesContent);
    } catch (error) {
      console.error('Error in Windows update endpoint:', error);
      res.status(500).send('Internal server error');
    }
  },
);

// Windows nupkg proxy endpoint
// Squirrel.Windows parses the nupkg filename it sees in RELEASES as
// `{id}-{version}-full.nupkg` and feeds the version into System.Version,
// which rejects strings containing an arch suffix (e.g. `-x64`). The
// /RELEASES endpoint therefore rewrites each nupkg URL to point here with
// the arch suffix stripped from the filename. This proxy restores the
// arch suffix and 302-redirects to the actual GitHub asset.
// GET /update/:appName/:channel/win/:arch/nupkg/:filename
router.get(
  '/update/:appName/:channel/win/:arch/nupkg/:filename',
  async (req: Request, res: Response) => {
    const { appName, channel, arch, filename } = req.params;

    if (appName !== config.appName) {
      res.status(404).send('App not found');
      return;
    }

    if (!isValidChannel(channel)) {
      res.status(400).send('Invalid channel');
      return;
    }

    if (!filename.endsWith('-full.nupkg')) {
      res.status(400).send('Invalid nupkg filename');
      return;
    }

    try {
      const match = await findNupkgAsset(channel, arch, filename);

      if (!match) {
        res.status(404).send('nupkg not found');
        return;
      }

      res.redirect(302, match.asset.browser_download_url);
    } catch (error) {
      console.error('Error in Windows nupkg proxy endpoint:', error);
      res.status(500).send('Internal server error');
    }
  },
);

// macOS download endpoint
// GET /download/:appName/:channel/macos/:arch
router.get(
  '/download/:appName/:channel/macos/:arch',
  async (req: Request, res: Response) => {
    const { appName, channel, arch } = req.params;

    if (appName !== config.appName) {
      res.status(404).send('App not found');
      return;
    }

    if (!isValidChannel(channel)) {
      res.status(400).send('Invalid channel');
      return;
    }

    try {
      const match = await findMacOSDownloadAsset(channel, arch);

      if (!match) {
        res.status(404).send('No release available');
        return;
      }

      res.redirect(302, match.asset.browser_download_url);
    } catch (error) {
      console.error('Error in macOS download endpoint:', error);
      res.status(500).send('Internal server error');
    }
  },
);

// Windows download endpoint
// GET /download/:appName/:channel/win/:arch
router.get(
  '/download/:appName/:channel/win/:arch',
  async (req: Request, res: Response) => {
    const { appName, channel, arch } = req.params;

    if (appName !== config.appName) {
      res.status(404).send('App not found');
      return;
    }

    if (!isValidChannel(channel)) {
      res.status(400).send('Invalid channel');
      return;
    }

    try {
      const match = await findWindowsDownloadAsset(channel, arch);

      if (!match) {
        res.status(404).send('No release available');
        return;
      }

      res.redirect(302, match.asset.browser_download_url);
    } catch (error) {
      console.error('Error in Windows download endpoint:', error);
      res.status(500).send('Internal server error');
    }
  },
);

// Linux download endpoints
// GET /download/:appName/:channel/linux/:format/:arch
router.get(
  '/download/:appName/:channel/linux/:format/:arch',
  async (req: Request, res: Response) => {
    const { appName, channel, format, arch } = req.params;

    if (appName !== config.appName) {
      res.status(404).send('App not found');
      return;
    }

    if (!isValidChannel(channel)) {
      res.status(400).send('Invalid channel');
      return;
    }

    if (!isValidLinuxFormat(format)) {
      res.status(400).send('Invalid format. Use "deb" or "rpm"');
      return;
    }

    try {
      const match = await findLinuxDownloadAsset(channel, arch, format);

      if (!match) {
        res.status(404).send('No release available');
        return;
      }

      res.redirect(302, match.asset.browser_download_url);
    } catch (error) {
      console.error('Error in Linux download endpoint:', error);
      res.status(500).send('Internal server error');
    }
  },
);

export default router;
