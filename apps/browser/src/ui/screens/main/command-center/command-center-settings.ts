import { HISTORY_PAGE_URL, SETTINGS_PAGE_URL } from '@shared/internal-urls';
import type { SettingCommandItem } from './command-center-model';

export type CommandCenterSettingDefinition = Omit<
  SettingCommandItem,
  'kind' | 'mode' | 'icon'
> & {
  iconName:
    | 'models'
    | 'key'
    | 'provider'
    | 'settings'
    | 'context'
    | 'plugins'
    | 'browser'
    | 'history';
};

export const commandCenterSettings: CommandCenterSettingDefinition[] = [
  {
    id: 'setting:models-providers',
    title: 'Models & Providers',
    subtitle: 'Configure model providers and coding plans',
    keywords: ['models', 'providers', 'llm', 'ai', 'coding plans'],
    url: SETTINGS_PAGE_URL,
    iconName: 'models',
  },
  {
    id: 'setting:api-keys',
    title: 'Set API Keys',
    subtitle: 'Connect Anthropic, OpenAI, Google, and other providers',
    keywords: [
      'api keys',
      'anthropic',
      'openai',
      'google',
      'deepseek',
      'moonshot',
      'alibaba',
      'z-ai',
      'minimax',
    ],
    url: SETTINGS_PAGE_URL,
    iconName: 'key',
  },
  {
    id: 'setting:custom-providers',
    title: 'Custom Providers',
    subtitle: 'Manage custom model endpoints',
    keywords: ['custom provider', 'endpoint', 'openai compatible', 'bedrock'],
    url: 'stagewise://internal/agent-settings/custom-providers',
    iconName: 'provider',
  },
  {
    id: 'setting:agent-general',
    title: 'General Agent Settings',
    subtitle: 'Configure default agent behavior',
    keywords: ['agent', 'general', 'settings', 'behavior'],
    url: 'stagewise://internal/agent-settings/general',
    iconName: 'settings',
  },
  {
    id: 'setting:skills-context',
    title: 'Skills & Context files',
    subtitle: 'Manage skill and context file preferences',
    keywords: ['skills', 'context', 'agents.md', 'workspace.md'],
    url: 'stagewise://internal/agent-settings/skills-context',
    iconName: 'context',
  },
  {
    id: 'setting:plugins',
    title: 'Plugins',
    subtitle: 'Configure bundled and enabled plugins',
    keywords: ['plugins', 'extensions', 'tools'],
    url: 'stagewise://internal/agent-settings/plugins',
    iconName: 'plugins',
  },
  {
    id: 'setting:browsing',
    title: 'Browsing Settings',
    subtitle: 'Configure browser behavior and permissions',
    keywords: ['browser', 'browsing', 'permissions', 'search engine'],
    url: 'stagewise://internal/browsing-settings',
    iconName: 'browser',
  },
  {
    id: 'setting:history',
    title: 'History',
    subtitle: 'Open browsing history',
    keywords: ['history', 'visited', 'pages'],
    url: HISTORY_PAGE_URL,
    iconName: 'history',
  },
];
