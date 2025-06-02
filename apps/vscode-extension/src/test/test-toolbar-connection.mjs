#!/usr/bin/env node

/**
 * Test script to verify toolbar connection and MCP notification delivery
 */

const DEFAULT_PORT = 5746;
const MAX_PORT_ATTEMPTS = 10;

async function findExtensionPort() {
  console.log('🔍 Scanning for VS Code extension on ports...');

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const port = DEFAULT_PORT + attempt;
    try {
      console.log(`   Trying port ${port}...`);
      const response = await fetch(`http://localhost:${port}/ping`, {
        signal: AbortSignal.timeout(300),
      });

      if (response.ok && (await response.text()) === 'pong') {
        console.log(`✅ Found extension on port ${port}`);
        return port;
      }
    } catch (error) {
      // Port not available, continue
    }
  }

  throw new Error(
    `Extension not found on any port ${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1}`,
  );
}

async function testToolbarConnection() {
  console.log('🔍 Testing Toolbar Connection and MCP Notification Delivery\n');

  try {
    // Step 1: Find the extension port
    const extensionPort = await findExtensionPort();

    // Step 2: Send a single MCP start notification with detailed logging
    console.log('\n2. Sending MCP start notification...');

    const startResponse = await fetch(
      `http://localhost:${extensionPort}/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: 'Testing toolbar connection',
          estimatedSteps: 1,
          toolName: 'connection_test',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message for connection verification',
              },
            },
            required: ['message'],
          },
          inputArguments: {
            message: 'Hello from connection test!',
          },
        }),
      },
    );

    if (!startResponse.ok) {
      throw new Error(
        `MCP start failed: ${startResponse.status} ${startResponse.statusText}`,
      );
    }

    const startResult = await startResponse.json();
    console.log('✅ MCP start notification sent successfully');
    console.log('📤 Response:', startResult);

    // Step 3: Wait a moment and send completion
    console.log('\n3. Waiting 2 seconds then sending completion...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const completionResponse = await fetch(
      `http://localhost:${extensionPort}/completion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: true,
          message: 'Connection test completed successfully',
          filesModified: ['test-connection.log'],
        }),
      },
    );

    if (!completionResponse.ok) {
      throw new Error(
        `MCP completion failed: ${completionResponse.status} ${completionResponse.statusText}`,
      );
    }

    const completionResult = await completionResponse.json();
    console.log('✅ MCP completion notification sent successfully');
    console.log('📤 Response:', completionResult);

    console.log(
      '\n🎯 Test completed! Check your browser toolbar to see if the enhanced MCP UI appeared.',
    );
    console.log('\n📋 Expected behavior:');
    console.log(
      '   • Enhanced MCP UI should show "Testing toolbar connection"',
    );
    console.log('   • Tool details should show "connection_test"');
    console.log(
      '   • Input arguments should show {"message": "Hello from connection test!"}',
    );
    console.log(
      '   • Input schema should show the message property definition',
    );
    console.log(
      '   • Progress should complete and show success with file modifications',
    );
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Make sure VS Code is running with the Stagewise extension');
    console.log('2. Make sure the toolbar is open in your browser');
    console.log('3. Check VS Code developer console for any error messages');
    console.log('4. Check browser developer console for any error messages');
    console.log('5. Verify the toolbar shows "Connected" status');
    console.log('6. Try reloading VS Code and opening a workspace');
  }
}

testToolbarConnection();
