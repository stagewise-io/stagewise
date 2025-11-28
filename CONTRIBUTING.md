# Contributing to stagewise

Welcome! This document provides an in-depth overview of the structure and architecture of the stagewise project. Understanding this layout will help you quickly find your way around the codebase and identify where to contribute.

---

## Project Structure & Architecture

stagewise is organized as a **monorepo** using [pnpm workspaces](https://pnpm.io/workspaces) and [turborepo](https://turbo.build/). The repository is divided into several key areas:

### 1. Applications (`apps/`)

* **website/**

  * The main web application, serving as the landing page and documentation site.
  * Contains all website-specific code, including routes, components, and documentation pages.
* **vscode-extension/**

  * The official VSCode (and Cursor) extension.
  * Integrates the stagewise toolbar with code editors, enabling communication between the browser and your local AI agent.
  * Contains extension source code, packaging scripts, and related assets.

### 2. Packages (`packages/`)

* **toolbar/**

  * This directory now serves as a monorepo for framework-specific toolbar packages. It houses the core logic and UI components, along with adapters for various frontend frameworks.
    * **core/** (`@toolbar/core`)
        * The fundamental browser toolbar package, providing the core UI and logic for DOM element selection, prompt sending, and plugin support.
        * Contains the main React components, hooks, utilities, and configuration for the toolbar's core functionality.
    * **next/** (`@toolbar/next`)
        * The specific package for integrating the stagewise toolbar with Next.js applications.
    * **vue/** (`@toolbar/vue`)
        * The specific package for integrating the stagewise toolbar with Vue.js applications.
    * **react/** (`@toolbar/react`)
        * The specific package for integrating the stagewise toolbar with React applications (outside of Next.js, or for generic React usage).
* **ui/**

  * Shared React component library.
  * Houses reusable UI elements (buttons, dialogs, forms, charts, etc.) used across apps and packages.
* **agent-interface/**

  * Contains the definitions and libraries needed to build an agent integration for the stagewise toolbar
* **typescript-config/**

  * Shared TypeScript configuration files for consistent type-checking and build settings across the monorepo.

### 3. Examples (`examples/`)

* Contains example integrations for popular frameworks:

  * **next-example/** (Next.js)
  * **svelte-kit-example/** (SvelteKit)
  * **nuxt-example/** (Nuxt)
* These serve as reference implementations for integrating the stagewise toolbar into different frontend stacks.

### 4. Playgrounds (`playgrounds/`)

* Experimental or sandbox environments for development and testing.
* Useful for trying out new features or debugging in isolation.

### 5. Root-level Configuration & Tooling

* **pnpm-workspace.yaml**: Declares workspace packages for pnpm.
* **turbo.json**: Turborepo configuration for task running and caching.
* **biome.jsonc**, **lefthook.yml**, **commitlint.config.js**: Linting, formatting, and commit hook configuration.
* **README.md**: Project overview and high-level documentation.

---

## How the Parts Interact

* The framework-specific **toolbar packages** (e.g., `@toolbar/next`, `@toolbar/react`, `@toolbar/vue`) are injected into frontend apps. They leverage `@toolbar/core` to provide the UI for selecting DOM elements and sending prompts.
* The **Agent Interface** interconnects the toolbar with any given agent. Our **Code Editor Extension** hosts one or more agents depending on the setup.
* The **Code Editor Extension** receives data from the active toolbar instance and communicates with your local AI agent (e.g., Cursor IDE).
* The **UI Library** is shared across the website, `@toolbar/core`, and potentially other packages for a consistent look and feel.
* **Examples** help demonstrate and test integrations in various environments using the appropriate framework-specific toolbar package.

This structure is designed for modularity, reusability, and ease of contribution. Each package and app is self-contained, with clear responsibilities and minimal coupling.

---

## Local Development

To set up the repo:

```bash
pnpm install
pnpm dev  # runs the website and playgrounds
```

To start the CLI:

```bash
pnpm build
cd apps/cli
pnpm dev -b
```

Useful commands:

* `pnpm dev` — start all dev servers
* `pnpm build` — build all packages
* `pnpm lint` — run linters and type checks
* `pnpm test` — run tests across packages

---

## Changesets and Versioning

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs. For any change that affects users, you must include a changeset:

```bash
pnpm changeset
```

This will guide you through:
1. Selecting the packages you've modified
2. Choosing the appropriate semver increment (patch, minor, or major)
3. Writing a description of your changes

Your PR will fail CI checks if it doesn't include a changeset when making changes to published packages. For documentation-only changes or fixes that don't affect package functionality, you can create an empty changeset:

```bash
pnpm changeset --empty
```

**Note:** Changes without a changeset cannot be merged to the main branch.

---

## Contribution Guidelines

* Follow our code style (enforced by Biome, Lefthook, and Commitlint).
* Write clear and descriptive commit messages.
* Open a GitHub issue or draft PR before making large changes.
* Add tests if you're adding new functionality (or explain why not).
* Prefer small, scoped pull requests over large ones.
* Include a changeset for any change affecting published packages.

---

## Need Help?

* 💬 Join our [Discord](https://discord.gg/gkdGsDYaKA) to ask questions and get support.
* 🐛 Found a bug? Open a [GitHub Issue](https://github.com/stagewise-io/stagewise/issues).
* 💡 Have a feature idea? Let's discuss it in [GitHub Discussions](#).
