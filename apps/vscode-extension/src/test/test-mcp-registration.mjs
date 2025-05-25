#!/usr/bin/env node

// Simple test script to verify MCP registration
import { initToolbar } from '../../../../toolbar/core/dist/index.es.js';

async function testMcpRegistration() {
  console.log('Testing MCP registration...');

  try {
    await initToolbar({
      plugins: [],
      mcpServers: [
        {
          name: 'test-server',
          config: {
            command: 'echo',
            args: ['test'],
            env: { TEST: 'true' },
          },
        },
      ],
    });

    console.log('✅ initToolbar completed successfully');
  } catch (error) {
    console.error('❌ initToolbar failed:', error);
  }
}

testMcpRegistration();
