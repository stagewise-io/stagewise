#!/usr/bin/env node

/**
 * Test script to verify the MCP notification fix - enhanced UI should appear
 */

async function findExtensionPort() {
  const DEFAULT_PORT = 5746;
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const port = DEFAULT_PORT + attempt;
    try {
      const response = await fetch(`http://localhost:${port}/ping`, {
        signal: AbortSignal.timeout(500),
      });

      if (response.ok && (await response.text()) === 'pong') {
        return port;
      }
    } catch (error) {
      // Continue to next port
    }
  }

  return null;
}

async function testMcpUIFix() {
  console.log('🧪 Testing MCP UI Fix - Enhanced Toolbar Display\n');

  try {
    // Find extension
    console.log('🔍 Looking for VS Code extension...');
    const port = await findExtensionPort();

    if (!port) {
      console.log('❌ VS Code extension not found. Please:');
      console.log('   1. Make sure VS Code is running');
      console.log('   2. Open a workspace in VS Code');
      console.log('   3. Check that Stagewise extension is enabled');
      console.log('   4. Look for any errors in VS Code Developer Console');
      return;
    }

    console.log(`✅ Found extension on port ${port}`);

    // Test the complete MCP notification flow
    console.log('\n🚀 Testing complete MCP notification flow...');

    // Step 1: Start with detailed tool info
    console.log('\n1️⃣ Sending MCP start notification...');
    const startResponse = await fetch(`http://localhost:${port}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Creating user authentication components',
        estimatedSteps: 4,
        toolName: 'create_react_component',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: {
              type: 'string',
              description: 'Name of the React component to create',
            },
            includeTypes: {
              type: 'boolean',
              description: 'Whether to include TypeScript type definitions',
            },
            styling: {
              type: 'string',
              enum: ['css', 'styled-components', 'tailwind'],
              description: 'Styling approach to use',
            },
          },
          required: ['componentName'],
        },
        inputArguments: {
          componentName: 'LoginForm',
          includeTypes: true,
          styling: 'tailwind',
        },
      }),
    });

    if (!startResponse.ok) {
      throw new Error(`Start failed: ${startResponse.status}`);
    }
    console.log('   ✅ Start notification sent');

    // Step 2: Progress updates
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('2️⃣ Sending progress updates...');
    for (let step = 1; step <= 4; step++) {
      const progressResponse = await fetch(
        `http://localhost:${port}/progress`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: `Step ${step}: ${['Creating component structure', 'Adding form validation', 'Implementing authentication logic', 'Adding error handling'][step - 1]}`,
            currentStep: step,
            totalSteps: 4,
            details: `Working on ${['component boilerplate', 'input validation rules', 'API integration', 'user feedback'][step - 1]}`,
          }),
        },
      );

      if (!progressResponse.ok) {
        throw new Error(`Progress ${step} failed: ${progressResponse.status}`);
      }
      console.log(`   ✅ Progress ${step}/4 sent`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    // Step 3: Completion
    console.log('3️⃣ Sending completion notification...');
    const completionResponse = await fetch(
      `http://localhost:${port}/completion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: 'Authentication components created successfully',
          filesModified: [
            'src/components/LoginForm.tsx',
            'src/components/LoginForm.test.tsx',
            'src/types/auth.ts',
          ],
        }),
      },
    );

    if (!completionResponse.ok) {
      throw new Error(`Completion failed: ${completionResponse.status}`);
    }
    console.log('   ✅ Completion notification sent');

    console.log('\n🎯 MCP notification sequence completed!');
    console.log('\n👀 CHECK YOUR BROWSER TOOLBAR NOW:');
    console.log(
      '   Expected: Enhanced MCP UI should have shown this progression:',
    );
    console.log(
      '\n   🚀 INITIAL: When you sent the prompt, you should have seen:',
    );
    console.log('      • Green "Agent Connected" status (from SRPC success)');
    console.log(
      '      • ✅ Successfully reached the agent! Waiting for task to begin...',
    );
    console.log('\n   📋 STARTING: Blue "AI Agent Starting" with tool details');
    console.log('      • Task: "Creating user authentication components"');
    console.log(
      '      • Tool: "create_react_component" with expand/collapse toggle',
    );
    console.log(
      '      • Input Schema: componentName, includeTypes, styling properties',
    );
    console.log(
      '      • Input Arguments: {"componentName": "LoginForm", "includeTypes": true, "styling": "tailwind"}',
    );
    console.log('\n   🔄 PROGRESS: Step-by-step progress with progress bar');
    console.log(
      '      • Step 1/4: Creating component structure → Step 4/4: Adding error handling',
    );
    console.log('\n   ✅ COMPLETION: Green success with files modified');
    console.log('      • Success message + 3 files listed');
    console.log(
      '\n❓ If you saw the AGENT CONNECTED state → NEW FEATURE WORKING! 🎉',
    );
    console.log(
      '❓ If you only saw starting/progress → Previous fix working ✅',
    );
    console.log(
      '❓ If you still see legacy loading → Something is still wrong ❌',
    );
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testMcpUIFix();
