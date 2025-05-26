import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import * as vscode from 'vscode';

export async function setupToolbar() {
  const prompt = `
<task>
  Implement the stagewise dev-tool into an existing web project to provide AI-powered editing capabilities through a browser toolbar.
</task>

<context>
  stagewise is a browser toolbar that connects frontend UI to code AI agents in your code editor. It allows developers to select elements in a web app, leave comments, and let AI agents make changes based on that context.
</context>

<requirements>
  1. Install the required stagewise package(s) for the project's framework
  2. Integrate the stagewise toolbar into the project structure (ensure it only runs in development mode)
</requirements>

<implementation_steps>
  <step_0>
    Identify the project's package manager (npm, yarn, pnpm, etc.). You must use the same package manager to install the stagewise package.
  </step_0>
  <step_1>
    Identify the project's frontend framework (React, Next.js, Vue, Svelte, etc.) and install the appropriate stagewise package.
    - For framework-agnostic (as fallback): @stagewise/toolbar
    - For React: @stagewise/toolbar-react
    - For Next.js: @stagewise/toolbar-next
    - For Vue/Nuxt: @stagewise/toolbar-vue
  </step_1>

  <step_2>
    Locate the appropriate entry point file for toolbar integration based on the framework:
    - React: src/main.tsx or similar entry file
    - Next.js: src/app/layout.tsx or similar root layout
    - Vue: src/App.vue or main entry file
    - Nuxt: app.vue or a layout file
    - SvelteKit: src/routes/+layout.svelte
  </step_2>

  <step_3>
    Create a basic toolbar configuration object with empty plugins array:
    \`\`\`typescript
    const stagewiseConfig = {
      plugins: []
    };
    \`\`\`
  </step_3>

  <step_4>
    Implement the toolbar using the framework-specific approach:
    
    - For React/React-based frameworks:
    \`\`\`tsx
    import { StagewiseToolbar } from '@stagewise/toolbar-react';
    // Add <StagewiseToolbar config={stagewiseConfig} /> to your component
    \`\`\`
    
    - For Next.js:
    \`\`\`tsx
    import { StagewiseToolbar } from '@stagewise/toolbar-next';
    // Add in layout.tsx: <StagewiseToolbar config={stagewiseConfig} />
    \`\`\`
    
    - For Vue/Nuxt:
    \`\`\`vue
    import { StagewiseToolbar } from '@stagewise/toolbar-vue';
    // Add in template: <StagewiseToolbar :config="config" />
    \`\`\`
    
    - For framework-agnostic:
    \`\`\`ts
    import { initToolbar } from '@stagewise/toolbar';
    // Call initToolbar(stagewiseConfig) in development mode
    \`\`\`
  </step_4>

  <step_5>
    Ensure the toolbar only runs in development mode:
    \`\`\`typescript
    if (process.env.NODE_ENV === 'development') {
      // Initialize toolbar here
    }
    \`\`\`
  </step_5>
</implementation_steps>

<important_notes>
  - The toolbar should NOT be included in production builds
  - For React apps, initialize the toolbar in a separate React root to avoid interfering with the main app
</important_notes>

<framework_specific_integrations>
  <react>
    Create a separate React root for the toolbar to avoid interfering with the main app tree.
    Use createRoot to render the StagewiseToolbar component in a dedicated DOM element.
  </react>
  
  <next>
    Include the StagewiseToolbar component in the root layout file (layout.tsx).
  </next>
  
  <vue>
    Add the StagewiseToolbar component to your main App component.
  </vue>
  
  <nuxt>
    Wrap the StagewiseToolbar component in a ClientOnly component to ensure it only renders on the client side.
  </nuxt>
  
  <svelte>
    Use onMount and browser check to ensure the toolbar only initializes on the client side.
    Create a wrapper component if needed for cleaner integration.
  </svelte>
</framework_specific_integrations>

<expected_outcome>
  A properly integrated stagewise toolbar that:
  1. Appears only in development mode
  2. Is not included in production builds
  3. Does not lead to any linting errors
</expected_outcome>`;

  await dispatchAgentCall({
    prompt,
    sessionId: vscode.env.sessionId,
  });
}
