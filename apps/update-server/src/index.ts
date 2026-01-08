import express from 'express';
import { config } from './config.js';
import { getReleases, startRefreshInterval } from './github.js';
import routes from './routes.js';

const app = express();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount routes
app.use('/', routes);

async function start() {
  // Initial fetch of releases
  console.log('Fetching initial releases...');
  try {
    const releases = await getReleases();
    console.log(`Loaded ${releases.length} releases`);
  } catch (error) {
    console.error('Failed to fetch initial releases:', error);
    process.exit(1);
  }

  // Start background refresh
  startRefreshInterval();

  // Start server
  app.listen(config.port, () => {
    console.log(`Update server running on port ${config.port}`);
    console.log(`App name: ${config.appName}`);
    console.log(`GitHub: ${config.githubOrg}/${config.githubRepo}`);
  });
}

start();
