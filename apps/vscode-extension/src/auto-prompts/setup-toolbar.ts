import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import * as vscode from 'vscode';

export async function setupToolbar() {
  const prompt = `
<task>
  Implement the stagewise toolbar into an existing web project to provide AI-powered editing capabilities through a browser toolbar.
</task>

<context>
  stagewise is a browser toolbar that connects frontend UI to coding AI agents in your code editor. It allows developers to select elements in a web app, leave comments, and let AI agents make changes based on that context.
</context>

<requirements>
  1. Install the required stagewise package(s) for the project's framework
  2. Integrate the stagewise toolbar into the project structure (ensure it only runs in development mode)
  3. Add the stagewise extension to the active repositories recommended extensions list. If the list does not yet exist, cretae a new one.
</requirements>

<implementation_steps>
  <step_0>
    Identify the project's package manager (npm, yarn, pnpm, etc.). You must use the same package manager to install the stagewise package.
  </step_0>
  <step_1>
    Identify, if the repository only contains one web app project or multiple. If multiple projects are located inside the repository, ask the user to which project the toolbar should be installed to.
  </step_1>
  <step_2>
    Identify, if the specific project already uses a stagewise package. If so, ask the user if they want to use the existing package or replace it with a new one.
  </step_2>
  <step_3>
    If the project already included stagewise, chek for correct integration and do changes if necessary.
    If the project does not include stagewise, install the appropriate stagewise package and follow the framework specific steps.
    If there is no description on how to install stagewise for the used framework, reject the users request and say that the user needs to install the stagewise package manually.
  </step_3>
</implementation_steps>

<framework_specific_integrations>
  <react>
    Use the \`@stagewise/toolbar-react\` package for integration.
    Also, install and use the \`@stagewise-plugins/react\` package for react specific functionality.

    Include the StagewiseToolbar component (exported by the \`\@stagewise/toolbar-react\` package) inside the top-most component of the app.
    Set the \`config\` prop to an object with the plugins array containing the \`ReactPlugin\` (default exported by the \`\@stagewise-plugins/react\` package).

    Note: The \`@stagewise/toolbar-react\` package already handles rendering the toolbar only in development mode. The "enabled" prop can be overriden with custom logic to conditionally load the toolbar.
  </react>
  
  <next>
    Use the \`@stagewise/toolbar-next\` package for integration.
    Also, install and use the \`@stagewise-plugins/react\` package for react specific functionality.

    Include the StagewiseToolbar component in the root layout file (layout.tsx).
    Set the \`config\` prop to an object with the plugins array containing the \`ReactPlugin\` (default exported by the \`\@stagewise-plugins/react\` package).

    Note: The \`@stagewise/toolbar-next\` package already handles opt-out of SSR so that a simple integration of the component is enough.
    Note: The \`@stagewise/toolbar-next\` package already handles rendering the toolbar only in development mode. The "enabled" prop can be overriden with custom logic to conditionally load the toolbar.
  </next>
  
  <vue>
    Use the \`@stagewise/toolbar-vue\` package for integration.
    Also, install and use the \`@stagewise-plugins/vue\` package for vue specific functionality.

    Add the StagewiseToolbar component to the main App component.
    Set the \`config\` prop to an object with the plugins array containing the \`VuePlugin\` (default exported by the \`\@stagewise-plugins/vue\` package).
  </vue>
  
  <nuxt>
    Use the \`@stagewise/toolbar-nuxt\` package for integration.
    Also, install and use the \`@stagewise-plugins/vue\` package for vue specific functionality.

    Wrap the StagewiseToolbar component in a ClientOnly component to ensure it only renders on the client side.
    Set the \`config\` prop to an object with the plugins array containing the \`VuePlugin\` (default exported by the \`\@stagewise-plugins/vue\` package).
  </nuxt>
  
  <svelte>
    Use the \`@stagewise/toolbar\` package for integration.

    If the project is using SvelteKit, put the following code into the \`hooks.client.ts\` file:
    \`\`\`ts
    import { initToolbar } from '@stagewise/toolbar';

    export function init() {
      // Keep other functionality that may already exist in the file
      // Just add the below initToolbar call (conditionally, depending if a dev mode is detected)

      // If the users uses other existing metrics to check for dev mode, use that instead of import.meta.env.DEV
      if (import.meta.env.DEV) {
        initToolbar({
          plugins: [],
        });
      }
    }
    \`\`\` 

    If the project is using Svelte without SvelteKit, put the following code into the \`main.ts\` file (or any other file that is the entry to the app):
    \`\`\`ts
    import { initToolbar } from '@stagewise/toolbar';

    initToolbar({
      plugins: [],
    });
    \`\`\`
  </svelte>

  <other_frameworks>
    Use the plain \`@stagewise/toolbar\` package for integration.
    
    Import the { initToolbar } function from the \`@stagewise/toolbar\` package.
    Call the initToolbar function without any arguments in the entry point of the app (e.g. main.ts, app.ts, etc.).

    Note: The \`@stagewise/toolbar\` package does NOT handle rendering the toolbar only in development mode. You need to implement this:
    \`\`\`ts
    import { initToolbar } from '@stagewise/toolbar';

    if (import.meta.env.DEV) { // or any other way to check for dev mode
      initToolbar();
    }
    \`\`\`
  </other_frameworks>

  <plain_javascript>
    Use the plain \`@stagewise/toolbar\` package for integration.

    Import the { initToolbar } function from the \`@stagewise/toolbar\` package and call it without any arguments in the entry point of the app (e.g. main.ts, app.ts, etc.).

    Note: The \`@stagewise/toolbar\` package does NOT handle rendering the toolbar only in development mode. You need to implement this:
    \`\`\`ts
    import { initToolbar } from '@stagewise/toolbar';

    if (import.meta.env.DEV) { // or any other way to check for dev mode
      initToolbar();
    }
    \`\`\`
  </plain_javascript>

</framework_specific_integrations>

<workspace_extensions_list>
  The recommended extensions lsit for a workspace is located in the root fo the workspace and has the filename "extensions.json".

  <example_list>
    {
      "recommendations": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
    }
  </example_list>

  <requirement>
    Make sure, that the stagewise extension is added to the recommended extensions list if it is not already present. The name of the extension is "stagewise.stagewise-vscode-extension".

    If the list does not yet exist, create a new one with the following content:
    <new_list_content>
      {
        "recommendations": ["stagewise.stagewise-vscode-extension"]
      }
    </new_list_content>
  </requirement>
</workspace_extensions_list>

<expected_outcome>
  A properly integrated stagewise toolbar that:
  1. Appears only in development mode
  2. Is not included in production builds
  3. Does not lead to any linting errors
  4. Is loaded once on initial opening in the browser
  5. Is only executed in the browser and not any SSR or server environment
</expected_outcome>

<next_steps_for_the_user>
1. The user should start dev mode in his web app.
2. The user should see the toolbar in the bottom right corner of the web app.
3. If the toolbar does not appear, the user should reach out to the stagewise team via Discord (https://discord.gg/gkdGsDYaKA).
</next_steps_for_the_user>
`;

  await dispatchAgentCall({
    prompt,
    sessionId: vscode.env.sessionId,
  });
}
