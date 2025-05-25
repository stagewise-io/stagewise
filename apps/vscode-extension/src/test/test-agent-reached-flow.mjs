#!/usr/bin/env node

/**
 * Test script specifically for the "Agent Reached" feature
 * Shows the progression: Chat → Agent Reached → Tool Start → Progress → Complete
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

async function testAgentReachedFlow() {
  console.log('🧪 Testing "Agent Reached" Feature\n');
  console.log('This test demonstrates the new 4-stage UI progression:');
  console.log('1. 🚀 Agent Reached (NEW!)');
  console.log('2. 📋 Tool Starting');
  console.log('3. 🔄 Progress Updates');
  console.log('4. ✅ Completion\n');

  try {
    const port = await findExtensionPort();

    if (!port) {
      console.log(
        '❌ VS Code extension not found. Please start VS Code with Stagewise extension.\n',
      );
      return;
    }

    console.log(`✅ Found extension on port ${port}\n`);

    console.log('📝 INSTRUCTIONS:');
    console.log('1. Open your browser toolbar (if not already open)');
    console.log('2. Send a prompt using the chat interface');
    console.log(
      '3. Watch for the green "Agent Connected" state to appear first!',
    );
    console.log('4. Then this test will simulate the rest of the flow...\n');

    console.log('⏳ Waiting 5 seconds for you to send a chat prompt...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log(
      '\n🎬 Now simulating the agent working (after you sent a prompt)...\n',
    );

    // Simulate the flow that happens after chat sends prompt and gets success
    console.log('Stage 1: 🚀 Agent Reached');
    console.log('   → This should appear when your SRPC call succeeds');
    console.log('   → Green "Agent Connected" with pulsing dot');
    console.log(
      '   → Message: "Successfully reached the agent! Waiting for task to begin..."',
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\nStage 2: 📋 Tool Starting');
    await fetch(`http://localhost:${port}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Testing agent reached feature',
        estimatedSteps: 2,
        toolName: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            testParam: {
              type: 'string',
              description: 'Parameter for testing the feature',
            },
          },
          required: ['testParam'],
        },
        inputArguments: {
          testParam: 'agent-reached-test',
        },
      }),
    });
    console.log('   ✅ Tool starting notification sent');
    console.log(
      '   → Should now show blue "AI Agent Starting" with tool details',
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\nStage 3: 🔄 Progress Updates');
    for (let step = 1; step <= 2; step++) {
      await fetch(`http://localhost:${port}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: `Step ${step}: ${step === 1 ? 'Verifying agent connection' : 'Completing test'}`,
          currentStep: step,
          totalSteps: 2,
          details:
            step === 1
              ? 'Confirming the agent reached state worked'
              : 'Finalizing the test',
        }),
      });
      console.log(`   ✅ Progress ${step}/2 sent`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    console.log('\nStage 4: ✅ Completion');
    await fetch(`http://localhost:${port}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Agent reached feature test completed successfully!',
        filesModified: ['test-agent-reached.log'],
      }),
    });
    console.log('   ✅ Completion notification sent');
    console.log('   → Should show green success with file list');

    console.log('\n🎉 Test completed!');
    console.log('\n📊 RESULTS TO CHECK:');
    console.log(
      '✅ Did you see green "Agent Connected" immediately after sending prompt?',
    );
    console.log('✅ Did it transition to blue "AI Agent Starting"?');
    console.log('✅ Did progress updates work with progress bar?');
    console.log('✅ Did completion show success with file modifications?');
    console.log(
      '\nIf YES to all → Agent Reached feature is working perfectly! 🎉',
    );
    console.log(
      'If NO to first → Check chat state is calling setAgentReached()',
    );
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testAgentReachedFlow();
