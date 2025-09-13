import type { Request, Response } from 'express';
import { oauthManager } from '../auth/oauth.js';
import { log } from '../utils/logger.js';

/**
 * Handles OAuth callback and returns a simple HTML page
 * that can communicate back to the parent window if opened as a popup
 */
export async function handleAuthCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query;
    
    if (!code || typeof code !== 'string') {
      throw new Error('No authorization code provided');
    }

    // Exchange code for tokens
    const token = await oauthManager.getToken();
    
    if (!token) {
      // Need to exchange the code
      // This would require refactoring the OAuth manager
      // For now, we'll just redirect to success
    }

    // Send success page with script to close popup or redirect
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body { 
            font-family: system-ui; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container { 
            text-align: center;
            background: white;
            padding: 2rem 3rem;
            border-radius: 10px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          }
          h1 { color: #22c55e; margin-bottom: 1rem; }
          p { color: #666; }
          .spinner {
            margin: 20px auto;
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ Authentication Successful</h1>
          <p>You can now close this window and return to your application.</p>
          <div class="spinner"></div>
          <p style="font-size: 0.9em; color: #999;">Redirecting...</p>
        </div>
        <script>
          // If this was opened as a popup, try to communicate back and close
          if (window.opener) {
            try {
              window.opener.postMessage({ type: 'auth-success' }, '*');
              setTimeout(() => window.close(), 1500);
            } catch (e) {
              console.error('Could not communicate with opener:', e);
            }
          } else {
            // If not a popup, redirect to the main app after a delay
            setTimeout(() => {
              window.location.href = '/';
            }, 2000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    log.error(`OAuth callback error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Failed</title>
        <style>
          body { 
            font-family: system-ui; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          }
          .container { 
            text-align: center;
            background: white;
            padding: 2rem 3rem;
            border-radius: 10px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          }
          h1 { color: #ef4444; margin-bottom: 1rem; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✗ Authentication Failed</h1>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p style="margin-top: 1.5rem;">
            <a href="/" style="color: #667eea; text-decoration: none;">Return to application</a>
          </p>
        </div>
        <script>
          // If this was opened as a popup, try to communicate back
          if (window.opener) {
            try {
              window.opener.postMessage({ type: 'auth-error', error: '${error instanceof Error ? error.message : 'Unknown error'}' }, '*');
              setTimeout(() => window.close(), 3000);
            } catch (e) {
              console.error('Could not communicate with opener:', e);
            }
          }
        </script>
      </body>
      </html>
    `);
  }
}