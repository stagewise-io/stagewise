import { useKartonState } from '@ui/hooks/use-karton';
import type { SettingsSection } from '@shared/settings-route';
import { ModelsProvidersSection } from './sections/models-providers-section';
import { CustomProvidersSection } from './sections/custom-providers-section';
import { GeneralSettingsSection } from './sections/general-settings-section';
import { SkillsContextSection } from './sections/skills-context-section';
import { PluginsSection } from './sections/plugins-section';
import { BrowsingSettingsSection } from './sections/browsing-settings-section';
import { WebsitePermissionsSection } from './sections/website-permissions-section';
import { ClearDataSection } from './sections/clear-data-section';
import { AccountSection } from './sections/account-section';
import { AboutSection } from './sections/about-section';
import { HistorySection } from './sections/history-section';

export function SettingsContent() {
  const settingsRoute = useKartonState((s) => s.appScreen.settingsRoute);
  const section = settingsRoute.section as SettingsSection;

  switch (section) {
    case 'models-providers':
      return <ModelsProvidersSection />;
    case 'custom-providers':
      return <CustomProvidersSection />;
    case 'agent-general':
      return <GeneralSettingsSection />;
    case 'skills-context':
      return <SkillsContextSection />;
    case 'plugins':
      return <PluginsSection />;
    case 'browsing':
      return <BrowsingSettingsSection />;
    case 'website-permissions':
      return <WebsitePermissionsSection />;
    case 'clear-data':
      return <ClearDataSection />;
    case 'account':
      return <AccountSection />;
    case 'about':
      return <AboutSection />;
    case 'history':
      return <HistorySection />;
  }
}
