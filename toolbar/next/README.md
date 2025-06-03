# <img src="https://github.com/stagewise-io/assets/blob/main/media/logo.png?raw=true" alt="stagewise logo" width="48" height="48" style="border-radius: 50%; vertical-align: middle; margin-right: 8px;" /> stagewise

# Eyesight for your AI-powered Code Editor.

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/stagewise.stagewise-vscode-extension?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise) [![Join us on Discord](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) <!-- [![Build Status](https://img.shields.io/github/actions/workflow/status/stagewise-io/stagewise/ci.yml?branch=main)](https://github.com/stagewise-io/stagewise/actions) -->


![stagewise demo](https://github.com/stagewise-io/assets/blob/main/media/demo.gif?raw=true)


## About the project

**stagewise is a browser toolbar that connects your frontend UI to your code ai agents in your code editor.**

* 🧠 Select any element(s) in your web app
* 💬 Leave a comment on it
* 💡 Let your AI-Agent do the magic

> Perfect for devs tired of pasting folder paths into prompts. stagewise gives your AI real-time, browser-powered context.


## ✨ Features

The stagewise Toolbar makes it incredibly easy to edit your frontend code with AI agents:

* ⚡ Works out of the box
* 🛠️ Customise using your own configuration file
* 📦 Does not impact bundle size
* 🧠 Sends DOM elements, screenshots & metadata to your AI agent
* 👇 Comment directly on live elements in the browser
* 🧪 Comes with playgrounds for React, Vue, and Svelte (`./playgrounds`)




## 📖 Quickstart 

### 1. 🧩 **Install the vs-code extension** 

Install the extension here: https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension

### 2. 👨🏽‍💻 **Install and inject the toolbar**

> [!TIP]
> 🪄 **Auto-Install the toolbar (AI-guided):** 
> 1. In Cursor, Press `CMD + Shift + P`
> 2. Enter `setupToolbar`
> 3. Execute the command and the toolbar will init automatically 🦄

Or follow the manual way:

Install [@stagewise/toolbar](https://www.npmjs.com/package/@stagewise/toolbar):
```bash
pnpm i -D @stagewise/toolbar
```

Inject the toolbar into your app dev-mode:

```ts
// 1. Import the toolbar
import { initToolbar } from '@stagewise/toolbar';

// 2. Define your toolbar configuration
const stagewiseConfig = {
  plugins: [
    {
      name: 'example-plugin',
      description: 'Adds additional context for your components',
      shortInfoForPrompt: () => {
        return "Context information about the selected element";
      },
      mcp: null,
      actions: [
        {
          name: 'Example Action',
          description: 'Demonstrates a custom action',
          execute: () => {
            window.alert('This is a custom action!');
          },
        },
      ],
    },
  ],
};

// 3. Initialize the toolbar when your app starts
// Framework-agnostic approach - call this when your app initializes
function setupStagewise() {
  // Only initialize once and only in development mode
  if (process.env.NODE_ENV === 'development') {
    initToolbar(stagewiseConfig);
  }
}

// Call the setup function when appropriate for your framework
setupStagewise();
```
> ⚡️ The toolbar will **automatically connect** to the extension!

> [!IMPORTANT]
> 🚫 **If nothing happens when a prompt is sent:**
> 
> If you have multiple Cursor windows open, the toolbar may send prompts to the wrong window, making it appear as if "no prompt is being sent". To ensure reliable operation:
> - Keep only one Cursor window open when using stagewise
>
> A fix for this is on the way!

### Framework-specific integration examples

For easier integration, we provide framework-specific NPM packages that come with dedicated toolbar components (e.g., `<StagewiseToolbar>`). You can usually import these from `@stagewise/[framework-name]`.

<details>
<summary>React.js</summary>

We provide the `@stagewise/toolbar-react` package for React projects. Initialize the toolbar in your main entry file (e.g., `src/main.tsx`) by creating a separate React root for it. This ensures it doesn't interfere with your main application tree.

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { StagewiseToolbar } from '@stagewise/toolbar-react';
import './index.css';

// Render the main app
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Initialize toolbar separately
const toolbarConfig = {
  plugins: [], // Add your custom plugins here
};

document.addEventListener('DOMContentLoaded', () => {
  const toolbarRoot = document.createElement('div');
  toolbarRoot.id = 'stagewise-toolbar-root'; // Ensure a unique ID
  document.body.appendChild(toolbarRoot);

  createRoot(toolbarRoot).render(
    <StrictMode>
      <StagewiseToolbar config={toolbarConfig} />
    </StrictMode>
  );
});
```
</details>

<details>
<summary>Next.js</summary>

Use the `@stagewise/toolbar-next` package for Next.js applications. Include the `<StagewiseToolbar>` component in your root layout file (`src/app/layout.tsx`).

```tsx
// src/app/layout.tsx
import { StagewiseToolbar } from '@stagewise/toolbar-next';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <StagewiseToolbar
          config={{
            plugins: [], // Add your custom plugins here
          }}
        />
        {children}
      </body>
    </html>
  );
}
```

</details>

<details>
<summary>Nuxt.js</summary>

For Nuxt.js projects, you can use the `@stagewise/toolbar-vue` package. Place the `<StagewiseToolbar>` component in your `app.vue` or a relevant layout file.

```vue
// app.vue
<script setup lang="ts">
import { StagewiseToolbar, type ToolbarConfig } from '@stagewise/toolbar-vue';

const config: ToolbarConfig = {
  plugins: [], // Add your custom plugins here
};
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <ClientOnly>
      <StagewiseToolbar :config="config" />
    </ClientOnly>
    <NuxtWelcome />
  </div>
</template>
```

</details>

<details>
<summary>Vue.js</summary>

Use the `@stagewise/toolbar-vue` package for Vue.js projects. Add the `<StagewiseToolbar>` component to your main App component (e.g., `App.vue`).

```vue
// src/App.vue
<script setup lang="ts">
import { StagewiseToolbar, type ToolbarConfig } from '@stagewise/toolbar-vue';

const config: ToolbarConfig = {
  plugins: [], // Add your custom plugins here
};
</script>

<template>
  <StagewiseToolbar :config="config" />
  <div>
    <!-- Your app content -->
  </div>
</template>
```

</details>

<details>
<summary>SvelteKit</summary>

For SvelteKit, you can integrate the toolbar using `@stagewise/toolbar` and Svelte's lifecycle functions, or look for a dedicated `@stagewise/toolbar-svelte` package if available. Create a component that conditionally renders/initializes the toolbar on the client side (e.g., `src/lib/components/StagewiseToolbarLoader.svelte` or directly in `src/routes/+layout.svelte`).

**Using `onMount` in `+layout.svelte` (with `@stagewise/toolbar`):**
```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { initToolbar, type ToolbarConfig } from '@stagewise/toolbar'; // Adjust path if needed

  onMount(() => {
    if (browser) {
      const stagewiseConfig: ToolbarConfig = {
        plugins: [
          // Add your Svelte-specific plugins or configurations here
        ],
      };
      initToolbar(stagewiseConfig);
    }
  });
</script>

<slot />
```

**Using a loader component (example from repository):**
The example repository uses a `ToolbarLoader.svelte` which wraps `ToolbarWrapper.svelte`. `ToolbarWrapper.svelte` would then call `initToolbar` from `@stagewise/toolbar`.

```svelte
<!-- examples/svelte-kit-example/src/lib/components/stagewise/ToolbarLoader.svelte -->
<script lang="ts">
import type { ToolbarConfig } from '@stagewise/toolbar';
// ToolbarWrapper.svelte is a custom component that would call initToolbar
import ToolbarWrapper from './ToolbarWrapper.svelte'; 
import { browser } from '$app/environment';

const stagewiseConfig: ToolbarConfig = {
  plugins: [
    // ... your svelte plugin config
  ],
};
</script>

{#if browser}
  <ToolbarWrapper config={stagewiseConfig} />
{/if}
```
You would then use `StagewiseToolbarLoader` in your `src/routes/+layout.svelte`.

</details>


## 🤖 Agent support 

| **Agent**      | **Supported**  |
| -------------- | -------------- |
| Cursor         | ✅             |
| Windsurf       | ✅              |
| GitHub Copilot | 🚧 In Progress |
| Cline          | ❌              |
| BLACKBOXAI     | ❌              |
| Console Ninja  | ❌              |
| Continue.dev   | ❌              |
| Claude Code    | ❌              |
| Amazon Q       | ❌              |
| Cody           | ❌              |
| Qodo           | ❌              |


## 🛣️ Roadmap

Check out our [project roadmap](./.github/ROADMAP.md) for upcoming features, bug fixes, and progress.

## 📜 License

stagewise is developed by tiq UG (haftungsbeschränkt) and offerend under the AGPLv3 license.

For more information on the license model, visit the [FAQ about the GNU Licenses](https://www.gnu.org/licenses/gpl-faq.html).

For use cases that fall outside the scope permitted by the AGPLv3 license, feel free to [📬 Contact Us](#contact-us-section).

## 🤝 Contributing

We're just getting started and love contributions! Check out our [CONTRIBUTING.md](https://github.com/stagewise-io/stagewise/blob/main/CONTRIBUTING.md) guide to get involved. For bugs and fresh ideas, please [Open an issue!](https://github.com/stagewise-io/stagewise/issues) 

## 💬 Community & Support 

* 👾 [Join our Discord](https://discord.gg/gkdGsDYaKA)
* 📖 Open an [issue on GitHub](https://github.com/stagewise-io/stagewise/issues) for dev support.


## 📬 Contact Us

Got questions or want to license stagewise for commercial or enterprise use?

📧 **[sales@stagewise.io](mailto:sales@stagewise.io)**


