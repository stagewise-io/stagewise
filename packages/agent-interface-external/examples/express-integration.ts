#!/usr/bin/env node

/**
 * Example: Express Integration
 *
 * This example demonstrates how to hook stagewise agent endpoints
 * into an existing Express application.
 */

import express from 'express';
import { createServer } from 'node:http';
import { createAgentHook } from '../src/agent/index.js';

async function main() {
  console.log(
    '🚀 Starting Express application with stagewise agent integration...',
  );

  try {
    // Create Express app
    const app = express();
    const server = createServer(app);

    // Add JSON middleware
    app.use(express.json());

    // Your existing Express routes
    app.get('/', (_req, res) => {
      res.json({
        message: 'Welcome to my application!',
        endpoints: {
          main: '/',
          agent: '/api/agent/info',
          websocket: '/api/agent/ws',
        },
      });
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Hook stagewise agent endpoints into your Express app
    const agentHook = await createAgentHook({
      app,
      server,
      name: 'Integrated Agent',
      description: 'Agent integrated into Express application',
      infoPath: '/api/agent/info', // Custom info endpoint
      wsPath: '/api/agent/ws', // Custom WebSocket endpoint
    });

    console.log(`✅ Express app with agent integration started!`);
    console.log(`📍 Main app: http://localhost:3000/`);
    console.log(`📋 Agent info: http://localhost:3000/api/agent/info`);
    console.log(`🔌 Agent WebSocket: ws://localhost:3000/api/agent/ws`);

    // Access the agent interface
    const agent = agentHook.interface;

    // Set agent as available
    agent.availability.set(true);

    // Set initial state
    agent.state.set('idle', 'Integrated agent ready');

    // Example: Send a welcome message
    agent.messaging.addPart({
      type: 'text',
      text: 'Hello! I am the integrated agent. I am part of your Express application!',
    });

    // Example: Enable tool calling
    agent.toolCalling.setToolCallSupport(true);

    // Start the server
    const port = 3000;
    server.listen(port, () => {
      console.log(`\n🔄 Express server running on port ${port}`);
      console.log('Press Ctrl+C to stop.');
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Express server...');
      server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error(
      '❌ Failed to start Express app with agent integration:',
      error,
    );
    process.exit(1);
  }
}

main();
