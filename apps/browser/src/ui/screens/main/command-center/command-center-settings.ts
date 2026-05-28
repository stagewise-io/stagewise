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
    | 'plugins'
    | 'browser'
    | 'history';
  settingsRoute?: SettingsRoute;
};

const ROUTE_MODELS_PROVIDERS: SettingsRoute = { section: 'models-providers' };
const ROUTE_CUSTOM_PROVIDERS: SettingsRoute = { section: 'custom-providers' };
const ROUTE_AGENT_GENERAL: SettingsRoute = { section: 'agent-general' };
const ROUTE_SKILLS_CONTEXT: SettingsRoute = { section: 'skills-context' };
const ROUTE_PLUGINS: SettingsRoute = { section: 'plugins' };
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
    id: 'setting:plugins',
    title: 'Plugins',
    subtitle: 'Configure bundled and enabled plugins',
    keywords: ['plugins', 'extensions', 'tools'],
    url: '',
    settingsRoute: ROUTE_PLUGINS,
    iconName: 'plugins',
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
