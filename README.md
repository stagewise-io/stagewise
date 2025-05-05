# <img src="https://github.com/stagewise-io/assets/blob/main/media/logo.png?raw=true" alt="stagewise logo" width="48" height="48" style="border-radius: 50%; vertical-align: middle; margin-right: 8px;" /> stagewise

# Eyesight for your AI-powered code editor.

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/stagewise.stagewise-vscode-extension?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension) [![GitHub Repo stars](https://img.shields.io/github/stars/stagewise-io/stagewise)](https://github.com/stagewise-io/stagewise) [![Join us on Discord](https://img.shields.io/discord/1229378372141056010?label=Discord&logo=discord&logoColor=white)](https://discord.gg/vsDjhubRbh) <!-- [![Build Status](https://img.shields.io/github/actions/workflow/status/stagewise-io/stagewise/ci.yml?branch=main)](https://github.com/stagewise-io/stagewise/actions) -->


![stagewise demo](https://github.com/stagewise-io/assets/blob/main/media/demo.gif?raw=true)


## About the project

**stagewise is a browser toolbar that connects your frontend UI to your code ai agents in your code editor.**

* 🧠 Select any element(s) in your web app
* 💬 Leave a comment on it
* 💡 Let your AI agent do the magic

> Perfect for devs tired of pasting folder paths into prompts. stagewise gives your AI real-time, browser-powered context.


## ✨ Features

The stagewise Toolbar makes it incredibly easy to edit your frontend code with AI agents:

* ⚡ Works out of the box
* 🛠️ Customise using your own configuration file
* 🔌 Connect to your own MCP server
* 📦 Does not impact bundle size
* 🧠 Sends DOM elements, screenshots & metadata to your AI agent
* 👇 Comment directly on live elements in the browser
* 🧪 Comes with playgrounds for React, Vue, and Svelte (`./playgrounds`)




## 📖 Quickstart 

### 1. 🧩 **Install the vs-code extension** 

Install the extension here: https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension

> [!NOTE]
> 💬 **Enable MCP support (Cursor):** 
> - The extension will auto-install a **stagewise MCP server**.
> - Cursor will prompt you to *enable* the server.
> - Click *enable* to let your agent call MCP-tools that the toolbar provides. ([Read more](#write-custom-mcp-tools))

### 2. 👨🏽‍💻 **Install and inject the toolbar**

Install [@stagewise/toolbar](https://www.npmjs.com/package/@stagewise/toolbar):
```bash
pnpm i -D @stagewise/toolbar
```

Inject the toolbar into your app dev-mode:

```js
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

### Framework-specific integration examples
> ⚡️ The toolbar will **automatically connect** to the extension!

Check out our framework-specific integration [examples](https://github.com/stagewise-io/stagewise/tree/main/examples) for Next.js, Nuxt and SveleKit.



## ⚙️ How it Works

stagewise connects your browser and code editor via:

* Toolbar in Chrome →
* stagewise Extension →
* Cursor IDE or compatible agent

Each comment includes:

* DOM element
* Your comment
* Screenshot
* Accessibility and performance hints (coming soon)


## 🤖 Agent support 

| **Agent**      | **Supported**  |
| -------------- | -------------- |
| Cursor         | ✅              |
| GitHub Copilot | 🚧 In Progress |
| Windsurf       | ❌              |
| Cline          | ❌              |
| BLACKBOXAI     | ❌              |
| Console Ninja  | ❌              |
| Continue.dev   | ❌              |
| Amazon Q       | ❌              |
| Cody           | ❌              |
| Qodo           | ❌              |


## 🛣️ Roadmap

Check out our [project roadmap](./.github/ROADMAP.md) for upcoming features, bug fixes, and progress.

## 📜 License

stagewise is developed by Goetze, Scharpff & Toews GbR under an **Open Core** model:

* 🧩 99% is open-source under AGPLv3
* 🏢 1% (enterprise features) is commercial

This allows us to:

* Keep core tech open and transparent
* Ensure sustainability and quality
* Prevent misuse by closed-source platforms

We believe this model creates a fair, open ecosystem that benefits both individuals and companies.

## 🤝 Contributing

We're just getting started and love contributions! Check out our [CONTRIBUTING.md](https://github.com/stagewise-io/stagewise/blob/main/CONTRIBUTING.md) guide to get involved. For bugs and fresh ideas, please [Open an issue!](https://github.com/stagewise-io/stagewise/issues) 

## 💬 Community & Support 

* [Join our Discord](https://discord.gg/vsDjhubRbh)
* Open an [issue on GitHub](https://github.com/stagewise-io/stagewise/issues) for dev support.


## 📬 Contact Us

Got questions or want to license stagewise for commercial or enterprise use?

📧 **[sales@stagewise.io](mailto:sales@stagewise.io)**


