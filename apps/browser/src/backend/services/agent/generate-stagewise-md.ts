import { knowledgeAgentTools, stripToolMetadata } from '@stagewise/agent-tools';
import type { getModelOptions } from './utils/get-model-settings';
import {
  getWorkspaceInfo,
  type WorkspaceInfo,
} from './prompt-builder/utils/workspace-info';
import { stepCountIs, type ToolSet } from 'ai';
import { generateText, type ModelMessage } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import path from 'node:path';

export const STAGEWISE_MD_FILENAME = 'STAGEWISE.md';

/**
 * Formats project info into a structured context string for the system prompt.
 */
function formatProjectContext(workspaceInfo: WorkspaceInfo): string {
  const lines: string[] = [];

  lines.push('## Pre-analyzed Project Information');
  lines.push('');

  if (workspaceInfo.gitRepoRoot) {
    lines.push(`- **Git Repository Root**: ${workspaceInfo.gitRepoRoot}`);
    lines.push(
      `- **Monorepo**: ${workspaceInfo.isLikelyMonorepo ? 'Yes (likely)' : 'No (single package)'}`,
    );
  }

  if (workspaceInfo.packageManager) {
    lines.push(`- **Package Manager**: ${workspaceInfo.packageManager}`);
  }

  if (workspaceInfo.packagesInRepo.length > 0) {
    lines.push('');
    lines.push('### Packages in Repository');
    for (const pkg of workspaceInfo.packagesInRepo.slice(0, 15)) {
      const relativePath = workspaceInfo.gitRepoRoot
        ? path.relative(
            workspaceInfo.gitRepoRoot,
            pkg.path.replace(/\/package\.json$/, ''),
          )
        : pkg.path.replace(/\/package\.json$/, '');

      const allDeps = [
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      ];
      const uniqueDeps = [...new Set(allDeps.map((d) => d.name))];
      const relevantDeps = uniqueDeps.slice(0, 8).join(', ');

      lines.push(
        `- **${pkg.name}** (${relativePath || '.'})${pkg.version ? ` v${pkg.version}` : ''}`,
      );
      if (relevantDeps) {
        lines.push(`  - Key deps: ${relevantDeps}`);
      }
    }

    if (workspaceInfo.packagesInRepo.length > 15) {
      lines.push(
        `- ... and ${workspaceInfo.packagesInRepo.length - 15} more packages`,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Generates the system prompt for the project analysis agent.
 * This agent analyzes an entire project and creates a STAGEWISE.md file.
 */
async function getSystemPrompt(clientRuntime: ClientRuntime): Promise<string> {
  const workspaceInfo = await getWorkspaceInfo(clientRuntime);
  const projectContext = formatProjectContext(workspaceInfo);
  const projectRoot = clientRuntime.fileSystem.getCurrentWorkingDirectory();

  return `# Stagewise Project Analysis Agent

You are a specialized code analysis agent for **stagewise**, a frontend development browser. Your task is to analyze an entire project and create a comprehensive \`${STAGEWISE_MD_FILENAME}\` file that will help the main stagewise agent understand the project.

## Your Mission

Analyze the project at **${projectRoot}** and create a \`${STAGEWISE_MD_FILENAME}\` file that provides essential context for frontend development assistance. This file will be included in the system prompt of stagewise's main coding agent to give it early orientation about the project.

## Important Context

**Stagewise is a frontend-focused development tool.** The main agent excels at:
- Visual design: colors, typography, spacing, layout
- UI/UX: navigation, interactions, accessibility
- Responsive design and cross-device optimization
- Component development and styling
- CSS/styling configuration and customization

The main agent does **NOT** have terminal command execution capabilities. It works by reading and editing source files directly.

## Available Tools

You have access to these file system tools:
- **readFileTool**: Read file contents (with optional line ranges)
- **listFilesTool**: List files/directories (with recursive and pattern options)
- **globTool**: Find files by name/path pattern (e.g., \`**/*.css\`, \`**/tailwind.config.*\`)
- **grepSearchTool**: Search inside file contents using regex
- **overwriteFileTool**: Write the final ${STAGEWISE_MD_FILENAME} file

## Analysis Strategy

1. **Start with root package.json** - Identify if monorepo, framework, dependencies, and scripts
2. **Map the project structure** - Understand apps, packages, and their relationships
3. **Find styling configuration** - Look for Tailwind, PostCSS, CSS-in-JS configs across packages
4. **Locate global styles** - Find globals.css, base styles, CSS variables
5. **Discover component structure** - Find UI components, design systems, shared libraries
6. **Identify key directories** - src/, app/, components/, styles/, packages/, apps/, etc.
7. **Check for design tokens** - CSS variables, theme files, color schemes
8. **Find linting/formatting config** - Look for Biome, ESLint, Prettier configs

## ${STAGEWISE_MD_FILENAME} Structure

Create the file with these sections (adapt based on what you discover):

\`\`\`markdown
# STAGEWISE.md

This file provides context to stagewise when working with this codebase.

## Project Overview
[Brief description of what the project does - 2-3 sentences. Include whether it's a monorepo or single app.]

## Architecture
[For monorepos: describe the project structure, key apps, and shared packages]
[For single apps: describe the main app structure]

### Apps / Entry Points
[List the main applications in the project]
- \`apps/web\` - Main web application
- \`apps/docs\` - Documentation site
[etc.]

### Shared Packages (if monorepo)
[List important shared packages]
- \`packages/ui\` - Shared component library
- \`packages/utils\` - Utility functions
[etc.]

## Tech Stack
- **Framework**: [e.g., Next.js 15, React 19, Vue 3, etc.]
- **Styling**: [e.g., Tailwind CSS v4, CSS Modules, styled-components]
- **UI Library**: [e.g., Radix UI, shadcn/ui, Material UI, if applicable]
- **Language**: [TypeScript/JavaScript]
- **Build Tools**: [e.g., Turbo, Nx, Vite, webpack]

## Linting & Formatting

### Tools
- **Linter**: [e.g., ESLint, Biome, or none detected]
- **Formatter**: [e.g., Prettier, Biome, or none detected]

### Configuration Files
[List the config files found, e.g.:]
- \`biome.json\` or \`biome.jsonc\` - Biome configuration
- \`.eslintrc.js\` / \`eslint.config.js\` - ESLint configuration
- \`.prettierrc\` - Prettier configuration

### Key Rules or Conventions
[Note any important formatting/linting conventions, e.g.:]
- Indent: 2 spaces / tabs
- Quotes: single / double
- Semicolons: required / omitted
- Import sorting: [describe if configured]

## Styling Configuration

### CSS Framework
[Describe the CSS approach - Tailwind config, PostCSS setup, etc.]

### Important Style Files
- \`path/to/globals.css\` - Global styles and CSS variables
- \`path/to/tailwind.config.ts\` - Tailwind configuration
[List other key style files]

### Design Tokens / CSS Variables
[List key CSS variables if they exist, e.g.:]
- \`--primary\`: Primary brand color
- \`--background\`: Background color
[Or note if using Tailwind's color system, theme, etc.]

### Dark Mode
[Describe dark mode implementation if present - CSS classes, media queries, theme provider]

## Component Structure

### Component Locations
- \`path/to/components/\` - Reusable UI components
- \`path/to/components/ui/\` - Base UI primitives
[List key component directories across the project]

### Component Patterns
[Describe component conventions - naming, file structure, patterns used]

## Key Paths for Frontend Development
[List the most important paths the agent should know about]
- \`apps/web/src/app/\` - Main app pages/routes
- \`packages/ui/src/\` - Shared UI components
- \`apps/web/src/styles/\` - Style files
[Adapt based on project structure]

## Styling Notes
[Any important notes about styling conventions, such as:]
- Use \`cn()\` utility for conditional class merging
- Follow existing Tailwind class ordering
- Components use [specific pattern]
\`\`\`

## Guidelines

- **Be concise**: The main agent has limited context window. Keep descriptions brief but informative.
- **Focus on frontend**: Emphasize styling, components, and UI-related information.
- **Use exact paths**: All file paths should be relative to the project root.
- **Only include what exists**: Don't guess or assume. Only document what you actually find.
- **Prioritize styling info**: CSS configuration, design tokens, and component styling patterns are most valuable.
- **Cover the whole project**: For monorepos, document all relevant apps and packages, not just one.
- **Skip backend details**: Database, API routes, server logic are less relevant unless they affect the frontend directly.

## Pre-analyzed Information

${projectContext}

## Final Step

After analyzing the codebase, use **overwriteFileTool** to create the \`${STAGEWISE_MD_FILENAME}\` file at the project root (${projectRoot}). The file should be immediately useful for a frontend development agent working anywhere in the project.
`;
}

/**
 * Analyzes an entire project and creates a STAGEWISE.md file with project context.
 * This file helps the main stagewise agent understand the project structure,
 * architecture, styling configuration, and component patterns across all apps and packages.
 */
export async function generateStagewiseMd(
  modelOptions: ReturnType<typeof getModelOptions>,
  clientRuntime: ClientRuntime,
  overwriteClientRuntime: ClientRuntime,
  _reason?: string,
): Promise<{ success: boolean; message: string; filePath?: string }> {
  const projectRoot = clientRuntime.fileSystem.getCurrentWorkingDirectory();
  const system = await getSystemPrompt(clientRuntime);
  const tools = stripToolMetadata(
    knowledgeAgentTools(clientRuntime, overwriteClientRuntime),
  );

  try {
    const prompt = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analyze the project at "${projectRoot}" and create a comprehensive ${STAGEWISE_MD_FILENAME} file.

Start by:
1. Reading the root package.json to understand if this is a monorepo and the overall tech stack
2. Using listFilesTool to understand the top-level directory structure (apps/, packages/, src/, etc.)
3. Using globTool to find all package.json files: \`**/package.json\`
4. Using globTool to find styling configs: \`**/tailwind.config.*\`, \`**/postcss.config.*\`, \`**/*.css\`
5. Using globTool to find linting/formatting configs: \`**/biome.json*\`, \`**/.eslintrc*\`, \`**/eslint.config.*\`, \`**/.prettierrc*\`
6. Reading key configuration files you discover

For monorepos:
- Identify all apps and their purposes
- Find shared packages, especially UI/component libraries
- Note how styling is shared or configured per-app

Once you have a clear picture of the entire project, create the ${STAGEWISE_MD_FILENAME} file at the project root using overwriteFileTool.

Remember: Focus on information that helps with frontend development - styling, components, UI patterns, and project architecture.`,
        },
      ],
    } satisfies ModelMessage;

    const _r = await generateText({
      model: modelOptions.model,
      messages: [{ role: 'system', content: system }, prompt],
      tools: tools as unknown as ToolSet,
      stopWhen: stepCountIs(75),
      maxRetries: 2,
      providerOptions: modelOptions.providerOptions,
      headers: modelOptions.headers,
    });

    const outputPath = path.join(projectRoot, STAGEWISE_MD_FILENAME);

    return {
      success: true,
      message: `Successfully created ${STAGEWISE_MD_FILENAME} with project analysis.`,
      filePath: outputPath,
    };
  } catch (error) {
    return {
      success: false,
      message:
        'Failed to generate STAGEWISE.md: ' +
        (error instanceof Error ? error.message : 'Unknown error'),
    };
  }
}
