# <img src="https://github.com/stagewise-io/assets/blob/main/media/logo.png?raw=true" alt="stagewise logo" width="48" height="48" style="border-radius: 50%; vertical-align: middle; margin-right: 8px;" /> stagewise

# The frontend coding agent for production codebases

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/stagewise.stagewise-vscode-extension?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise) [![Join us on Discord](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/gkdGsDYaKA) <!-- [![Build Status](https://img.shields.io/github/actions/workflow/status/stagewise-io/stagewise/ci.yml?branch=main)](https://github.com/stagewise-io/stagewise/actions) -->


![stagewise demo](https://github.com/stagewise-io/assets/blob/main/media/demo.gif?raw=true)

> [!IMPORTANT]
> ## 🚀 A 10x Faster Frontend Agent is Coming. The stagewise agent.
> 
> We're building a native frontend agent that integrates seamlessly with stagewise - delivering 10x faster UI development with unprecedented accuracy. 
> 
> **[Get Early Access to the stagewise agent →](https://stagewise.io/waitlist)**

## About the project

Welcome to **stagewise** —  The frontend coding agent for production codebases

- 💬 Tell the agent what you want to change
- 🧠 Click on element(s) to let the agent know where a change should happen
- 💡 Let stagewise do the magic!

> Perfect for devs tired of pasting element information and folder paths into prompts. stagewise uses real-time, browser-powered context.

## Features

- ⚡ Works out of the box
- 🧩 Customize and extend functionality with Plugins
- 📖 Open source
- ⛓️ Compatible with all kinds of frameworks
- 🧠 Use our dedicated frontend agent - or any other compatible through our open agent interface!


## 📖 Quickstart 

### 1. 🧩 **Install the extension**

Install the extension from the extension store of your code editor:

- **Cursor**: [cursor:extension/stagewise.stagewise-vscode-extension](cursor:extension/stagewise.stagewise-vscode-extension)
- **VS Code**: [vscode:extension/stagewise.stagewise-vscode-extension](vscode:extension/stagewise.stagewise-vscode-extension)
- **Trae**: [trae:extension/stagewise.stagewise-vscode-extension](trae:extension/stagewise.stagewise-vscode-extension)
- **Windsurf**: [windsurf:extension/stagewise.stagewise-vscode-extension](windsurf:extension/stagewise.stagewise-vscode-extension)

### 2. 👨🏽‍💻 **Install and inject the toolbar (the extension will guide you)**

> [!TIP]
> 🪄 **AI-Assisted Setup (recommended):** 
> 1. In Cursor, Press `CMD + Shift + P`
> 2. Enter `setupToolbar`
> 3. Execute the command and the toolbar will init automatically 🦄

Or follow the Manual Setup:

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
  plugins: [],
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

### 3. **Setup your stagewise account**

> 🪄 **Auto-Install the toolbar (AI-guided):**
> 1. In your IDE, Press `⌘ + Shift + P`
> 2. Enter `Login to stagewise`
> 3. Execute the command and follow the guide
> 4. You're good to go!

> ⚡️ The toolbar will **automatically connect** to the extension when opening up the dev mode of your app

### 4. 🎉 **Start dev mode and begin coding!**

The toolbar should appear in the bottom right corner of your web app. If not, please reach out via [Discord](https://discord.gg/gkdGsDYaKA).

### Framework-specific integration examples

For easier integration, we provide framework-specific NPM packages that come with dedicated toolbar components (e.g., `<StagewiseToolbar>`). You can usually import these from `@stagewise/toolbar-[framework-name]`.

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
| stagewise agent| ✅⭐️           |
| Cursor         | ✅             |
| GitHub Copilot | ✅             |
| Windsurf       | ✅             |
| Cline          | ✅             |
| Roo Code       | ✅             |
| Kilo Code      | ✅             |
| Trae           | ✅             |


## 🛣️ Roadmap

Check out our [project roadmap](./.github/ROADMAP.md) for upcoming features, bug fixes, and progress.

## 📜 License

stagewise is developed by tiq UG (haftungsbeschränkt) and offered under the AGPLv3 license.

For more information on the license model, visit the [FAQ about the GNU Licenses](https://www.gnu.org/licenses/gpl-faq.html).

For use cases that fall outside the scope permitted by the AGPLv3 license, feel free to [📬 Contact Us](#contact-us-section).

## 🤝 Contributing

We're just getting started and love contributions! Check out our [CONTRIBUTING.md](https://github.com/stagewise-io/stagewise/blob/main/CONTRIBUTING.md) guide to get involved. For bugs and fresh ideas, please [Open an issue!](https://github.com/stagewise-io/stagewise/issues) 

## 💻 Test stagewise locally

1. `git clone https://github.com/stagewise-io/stagewise && cd stagewise` 
2. `pnpm i && pnpm dev`
3. Open the `stagewise` project in your IDE
4. Uninstall/ Disable the official `stagewise` extension
5. Press F5 (a new IDE window with the local extension-version installed will open up)
6. Visit `http://localhost:3002` 
> You will see a next.js example application with the `stagewise`-toolbar already set up.
> It will be connected to the local vscode-extension in `apps/vscode-extension` and reflect all the extension-changes you apply locally.



## 💬 Community & Support 

* 👾 [Join our Discord](https://discord.gg/gkdGsDYaKA)
* 📖 Open an [issue on GitHub](https://github.com/stagewise-io/stagewise/issues) for dev support.


## 📬 Contact Us

Got questions or want to license stagewise for commercial or enterprise use?

📧 **[sales@stagewise.io](mailto:sales@stagewise.io)**