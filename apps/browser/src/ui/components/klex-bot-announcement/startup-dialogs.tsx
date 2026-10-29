import { WhatsNewDialog } from '@ui/components/release-notes';
import { useKlexBotAnnouncement } from './controller';
import { KlexBotAnnouncementDialog } from './dialog';

export function StartupDialogs() {
  const { startupBlocked, setChangelogVisible } = useKlexBotAnnouncement();
  return (
    <>
      <KlexBotAnnouncementDialog />
      <WhatsNewDialog
        enabled={!startupBlocked}
        onVisibilityChange={setChangelogVisible}
      />
    </>
  );
}
