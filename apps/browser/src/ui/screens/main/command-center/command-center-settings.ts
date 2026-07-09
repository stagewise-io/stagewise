import type { SettingCommandItem } from './command-center-model';
import type { SettingsRoute } from '@shared/settings-route';

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
    | 'worktrees'
    | 'plugins'
    | 'browser'
    | 'history'
    | 'personalization';
  settingsRoute?: SettingsRoute;
};

const ROUTE_MODELS_PROVIDERS: SettingsRoute = { section: 'models-providers' };
const ROUTE_CUSTOM_PROVIDERS: SettingsRoute = { section: 'custom-providers' };
const ROUTE_AGENT_GENERAL: SettingsRoute = { section: 'agent-general' };
const ROUTE_SKILLS_CONTEXT: SettingsRoute = { section: 'skills-context' };
const ROUTE_WORKTREE_SETUP: SettingsRoute = { section: 'worktree-setup' };
const ROUTE_PLUGINS: SettingsRoute = { section: 'plugins' };
const ROUTE_PERSONALIZATION: SettingsRoute = { section: 'personalization' };
const ROUTE_BROWSING: SettingsRoute = { section: 'browsing' };
const ROUTE_HISTORY: SettingsRoute = { section: 'history' };

export const commandCenterSettings: CommandCenterSettingDefinition[] = [
  {
    id: 'setting:models-providers',
    title: 'Models & Providers',
    subtitle: 'Configure model providers and coding plans',
    keywords: ['models', 'providers', 'llm', 'ai', 'coding plans'],
    url: '',
    settingsRoute: ROUTE_MODELS_PROVIDERS,
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
      'xiaomi-mimo',
      'mistral',
      'tencent',
      'hunyuan',
    ],
    url: '',
    settingsRoute: ROUTE_MODELS_PROVIDERS,
    iconName: 'key',
  },
  {
    id: 'setting:custom-providers',
    title: 'Custom Providers',
    subtitle: 'Manage custom model endpoints',
    keywords: ['custom provider', 'endpoint', 'openai compatible', 'bedrock'],
    url: '',
    settingsRoute: ROUTE_CUSTOM_PROVIDERS,
    iconName: 'provider',
  },
  {
    id: 'setting:agent-general',
    title: 'General Agent Settings',
    subtitle: 'Configure default agent behavior',
    keywords: ['agent', 'general', 'settings', 'behavior'],
    url: '',
    settingsRoute: ROUTE_AGENT_GENERAL,
    iconName: 'settings',
  },
  {
    id: 'setting:skills-context',
    title: 'Skills & Context files',
    subtitle: 'Manage skill and context file preferences',
    keywords: ['skills', 'context', 'agents.md', 'workspace.md'],
    url: '',
    settingsRoute: ROUTE_SKILLS_CONTEXT,
    iconName: 'context',
  },
  {
    id: 'setting:worktree-setup',
    title: 'Worktrees',
    subtitle: 'Manage worktree setup scripts',
    keywords: ['worktree', 'worktrees', 'setup', 'script', 'branch'],
    url: '',
    settingsRoute: ROUTE_WORKTREE_SETUP,
    iconName: 'worktrees',
  },
  {
    id: 'setting:plugins',
    title: 'Plugins',
    subtitle: 'Configure bundled and enabled plugins',
    keywords: ['plugins', 'extensions', 'tools'],
    url: '',
    settingsRoute: ROUTE_PLUGINS,
    iconName: 'plugins',
  },
  {
    id: 'setting:personalization',
    title: 'Personalization',
    subtitle:
      'Configure UI size, theme colors, notifications, and dock behavior',
    keywords: ['personalization', 'theme', 'colors', 'ui size', 'sound'],
    url: '',
    settingsRoute: ROUTE_PERSONALIZATION,
    iconName: 'personalization',
  },
  {
    id: 'setting:browsing',
    title: 'Browsing Settings',
    subtitle: 'Configure browser behavior and permissions',
    keywords: ['browser', 'browsing', 'permissions', 'search engine'],
    url: '',
    settingsRoute: ROUTE_BROWSING,
    iconName: 'browser',
  },
  {
    id: 'setting:history',
    title: 'History',
    subtitle: 'Open browsing history',
    keywords: ['history', 'visited', 'pages'],
    url: '',
    settingsRoute: ROUTE_HISTORY,
    iconName: 'history',
  },
];
