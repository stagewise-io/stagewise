export type SettingsSection =
  | 'models-providers'
  | 'custom-providers'
  | 'agent-general'
  | 'skills-context'
  | 'worktree-setup'
  | 'plugins'
  | 'browsing'
  | 'history'
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
  browsing: 'General',
  history: 'History',
  'website-permissions': 'Website Permissions',
  'clear-data': 'Clear data',
  account: 'Account',
  about: 'About',
};
