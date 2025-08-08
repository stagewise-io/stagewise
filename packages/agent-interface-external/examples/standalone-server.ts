#!/usr/bin/env node

/**
 * Example: Standalone Agent Server
 *
 * This example demonstrates how to create a standalone stagewise agent server
 * with custom configuration.
 */

import { createAgentServer } from '../src/agent/index.js';

async function main() {
  console.log('🚀 Starting standalone stagewise agent server...');

  try {
    // Create a standalone agent server with custom configuration
    const agentServer = await createAgentServer({
      name: 'Example Agent',
      description: 'A demonstration agent server',
      port: 3000, // Custom port
      infoPath: '/agent/info', // Custom info endpoint
      wsPath: '/agent/ws', // Custom WebSocket endpoint
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      },
    });

    console.log(`✅ Agent server started successfully!`);
    console.log(`📍 Server running on port: ${agentServer.port}`);
    console.log(
      `📋 Info endpoint: http://localhost:${agentServer.port}/agent/info`,
    );
    console.log(
      `🔌 WebSocket endpoint: ws://localhost:${agentServer.port}/agent/ws`,
    );

    // Access the agent interface
    const agent = agentServer.interface;

    // Set agent as available
    agent.availability.set(true);

    // Set initial state
    agent.state.set('idle', 'Ready to process requests');

    // Example: Send a welcome message
    agent.messaging.addPart({
      type: 'text',
      text: 'Hello! I am the example agent server. I am ready to help you!',
    });

    // Example: Enable tool calling
    agent.toolCalling.setToolCallSupport(true);

    // Keep the server running
    console.log('\n🔄 Server is running. Press Ctrl+C to stop.');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down agent server...');
      agentServer.server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start agent server:', error);
    process.exit(1);
  }
}

main();
