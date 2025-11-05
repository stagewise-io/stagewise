import type { AuthService } from '../auth';
import type express from 'express';
import { stagewiseAppPrefix } from './shared';

export async function setupAuthRoutes(
  app: express.Application,
  authService: AuthService,
) {
  // First, we serve the UI app in the defined path
  app.options(`${stagewiseAppPrefix}/auth/callback`, (_, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.status(200).send('OK');
  });

  app.get(`${stagewiseAppPrefix}/auth/callback`, async (req, res) => {
    const authCode = req.query.authCode;
    const error = req.query.error;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    await authService.handleAuthCodeExchange(
      authCode as string | undefined,
      error as string | undefined,
    );

    res.status(200).send('Authentication callback received');
  });
}
