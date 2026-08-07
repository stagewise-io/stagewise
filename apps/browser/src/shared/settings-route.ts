export type SettingsSection =
  | 'models-providers'
  | 'custom-providers'
  | 'agent-general'
  | 'skills-context'
  | 'worktree-setup'
  | 'plugins'
  | 'personalization'
  | 'browsing'
  | 'history'
  | 'archived-agents'
  | 'website-permissions'
  | 'clear-data'
  | 'account'
  | 'about';

export type SettingsRoute =
  | { section: Exclude<SettingsSection, 'website-permissions'> }
  | { section: 'website-permissions'; host: string };

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  'models-providers': 'Models & Providers',
  'custom-providers': 'Custom Providers',
  'agent-general': 'General',
  'skills-context': 'Skills & Context files',
  'worktree-setup': 'Worktrees',
  plugins: 'Plugins',
  personalization: 'Personalization',
  browsing: 'General',
  history: 'History',
  'archived-agents': 'Archived chats',
  'website-permissions': 'Website Permissions',
  'clear-data': 'Clear data',
  account: 'Account',
  about: 'About',
};
