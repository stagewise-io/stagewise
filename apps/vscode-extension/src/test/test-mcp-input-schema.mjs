#!/usr/bin/env node

/**
 * Test script to demonstrate the enhanced MCP tool call UI with input schema display
 * This simulates an agent making tool calls with detailed input schema and arguments
 */

const EXTENSION_PORT = 5746; // Default port for VS Code extension HTTP server (DEFAULT_PORT)

async function makeRequest(endpoint, data) {
  try {
    const response = await fetch(
      `http://localhost:${EXTENSION_PORT}${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`✅ ${endpoint}:`, result.message);
    return result;
  } catch (error) {
    console.error(`❌ ${endpoint}:`, error.message);
    throw error;
  }
}

async function simulateToolCallWithSchema() {
  console.log('🚀 Starting MCP tool call simulation with input schema...\n');

  // Step 1: Start a task with detailed tool information
  await makeRequest('/start', {
    task: 'Implementing user authentication system',
    estimatedSteps: 4,
    toolName: 'create_file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path where the content should be written',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
        encoding: {
          type: 'string',
          enum: ['utf8', 'base64'],
          default: 'utf8',
          description: 'The encoding to use when writing the file',
        },
      },
      required: ['path', 'content'],
    },
    inputArguments: {
      path: 'src/auth/login.tsx',
      content:
        'import React from "react";\n\nexport function LoginForm() {\n  return (\n    <form className="login-form">\n      <input type="email" placeholder="Email" />\n      <input type="password" placeholder="Password" />\n      <button type="submit">Login</button>\n    </form>\n  );\n}',
      encoding: 'utf8',
    },
  });

  // Wait a bit to see the starting state
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 2: Progress update
  await makeRequest('/progress', {
    step: 'Creating login component structure',
    currentStep: 1,
    totalSteps: 4,
    details: 'Setting up React component with TypeScript interfaces',
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Step 3: Another progress update
  await makeRequest('/progress', {
    step: 'Adding form validation logic',
    currentStep: 2,
    totalSteps: 4,
    details: 'Implementing email and password validation rules',
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Step 4: Another progress update
  await makeRequest('/progress', {
    step: 'Integrating with authentication API',
    currentStep: 3,
    totalSteps: 4,
    details: 'Connecting form submission to backend authentication service',
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Step 5: Final progress update
  await makeRequest('/progress', {
    step: 'Adding error handling and loading states',
    currentStep: 4,
    totalSteps: 4,
    details: 'Implementing user feedback for authentication states',
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Step 6: Complete successfully
  await makeRequest('/completion', {
    success: true,
    message: 'User authentication system implemented successfully',
    filesModified: [
      'src/auth/login.tsx',
      'src/auth/types.ts',
      'src/hooks/useAuth.ts',
      'src/utils/validation.ts',
    ],
  });

  console.log(
    '\n✨ Tool call simulation completed! Check the toolbar for the enhanced UI with input schema details.',
  );
}

async function simulateErrorCase() {
  console.log('\n🔄 Simulating error case...\n');

  await makeRequest('/start', {
    task: 'Attempting to modify read-only file',
    estimatedSteps: 2,
    toolName: 'edit_file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to edit',
        },
        content: {
          type: 'string',
          description: 'New content for the file',
        },
      },
      required: ['path', 'content'],
    },
    inputArguments: {
      path: '/etc/hosts',
      content: '127.0.0.1 localhost',
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await makeRequest('/error', {
    error: 'Permission denied: Cannot write to read-only file',
    context:
      'Attempted to modify system file /etc/hosts without sufficient privileges',
    recoverable: false,
  });

  console.log('\n❌ Error case simulation completed!');
}

// Main execution
async function main() {
  try {
    console.log('🧪 MCP Input Schema Display Test\n');
    console.log(
      'This script demonstrates the enhanced MCP tool call UI that shows:',
    );
    console.log('• Tool name and description');
    console.log('• Input schema with property types and descriptions');
    console.log('• Actual input arguments passed to the tool');
    console.log('• Real-time progress with step counters');
    console.log('• File modification results\n');

    // Test successful case
    await simulateToolCallWithSchema();

    // Wait before error case
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test error case
    await simulateErrorCase();
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    console.log('\n🔍 Make sure:');
    console.log('1. VS Code is running with the Stagewise extension');
    console.log(
      '2. The extension HTTP server is running on port 5746 (or the next available port)',
    );
    console.log('3. The toolbar is visible and connected');
    process.exit(1);
  }
}

main();
