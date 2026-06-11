import type { TutorialStep } from '@ui/contexts/tutorial';

export const TUTORIALS = {
  'general-ui-experience': [
    {
      targetSelector: '#chat-input-container-box',
      title: 'Chat Input',
      description:
        'Type messages here. You can also drag files, mention tabs or workspaces with `@`, and use `/` commands.',
    },
    {
      targetSelector: '[aria-label="Connect workspace"]',
      title: 'Read/Write Access to Workspaces',
      description:
        'Connect agents to one or more workspaces, both regular directories and Git repositories.',
    },
    {
      targetSelector: '#new-tab-buttons',
      title: 'Browser, Terminal & File Tree',
      description:
        'Open browser or terminal tabs here, and toggle the file tree to browse workspace files.',
    },
    {
      targetSelector: '#new-sidebar-panel',
      title: 'Agent Sidebar',
      description:
        'This sidebar shows all your agents. Each agent keeps its own chat, tabs, and mounted workspaces.',
    },
    {
      targetSelector: '[data-tutorial="agent-card"]',
      title: 'Agent Status',
      description:
        'This is one agent. Once you start working with an agent, a colored status dot may appear next to its title with one of these colors:\n\n' +
        '- **Blue** — Working\n' +
        '- **Green** — Done\n' +
        '- **Yellow** — Waiting for your response\n' +
        '- **Red** — Error',
    },
  ],

  'workspace-selection': [
    {
      targetSelector: '[data-tutorial="workspace-badge"]',
      title: 'Connected Git Repository',
      description:
        'The agent can **read** files, **edit** code, and **run** commands inside this Git repository.',
    },
    {
      targetSelector: '[data-tutorial="workspace-action-trigger"]',
      title: 'Configure Worktree / Branch Mode',
      description:
        'Click this dropdown to choose whether to work with a branch in the repository root, or with a worktree.',
    },
  ],

  'workspace-selection-options': [
    {
      targetSelector: '[data-tutorial="action-create-worktree"]',
      title: 'Create new Worktree',
      description:
        'Creates a **new worktree** with its own branch for the agent to work in.\n\nYou can choose which source branch to base the new worktree on.',
    },
    {
      targetSelector: '[data-tutorial="action-switch-worktree"]',
      title: 'Use existing Worktree',
      description:
        'Connects the agent to an **already-existing worktree**.\n\nThis makes it easy to let **multiple agents work on the same worktree**.',
    },
    {
      targetSelector: '[data-tutorial="action-create-branch"]',
      title: 'Create new Branch',
      description:
        'Creates a **new branch in the repository root** — simpler than worktrees. Use this when you want to work directly in the repository without creating a worktree.',
    },
    {
      targetSelector: '[data-tutorial="action-switch-branch"]',
      title: 'Use existing Branch',
      description:
        'Switches the agent to an **already-existing branch** in the repository root. The simplest option — just pick a branch and start working.',
    },
  ],

  'content-tabs': [
    {
      targetSelector: '[data-tutorial="content-tab-item"]',
      title: 'Opened Tabs',
      description:
        'Tabs appear here. The **pin** icon makes a tab global so it stays visible across all agents, and the **close** icon removes it.',
    },
  ],

  'browser-element-selector': [
    {
      targetSelector: '[data-tutorial="chat-element-selector"]',
      title: 'Reference Elements',
      description:
        'Use this to select elements in the browser and add them to the chat as references.',
    },
  ],

  'file-tree': [
    {
      targetSelector: '[data-tutorial="file-tree-panel"]',
      title: 'File Trees',
      description:
        'See all files from all workspaces mounted to the current agent. You can browse, open, and preview files right here.',
    },
    {
      targetSelector: '[data-tutorial="file-tree-workspace-tabs"]',
      title: 'Switch Workspace',
      description: 'Switch between file trees of the mounted workspaces here.',
    },
  ],
} as const satisfies Record<string, TutorialStep[]>;
