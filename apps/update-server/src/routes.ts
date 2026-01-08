import { Router, type Request, type Response } from 'express';
import type { Channel, LinuxFormat } from './config.js';
import { config } from './config.js';
import {
  findMacOSUpdateAsset,
  findMacOSDownloadAsset,
  findWindowsUpdateAsset,
  findWindowsDownloadAsset,
  findLinuxDownloadAsset,
} from './releases.js';

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
      const match = await findWindowsUpdateAsset(channel, arch, version);

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
