import { useState } from 'react';
import { IconXmarkOutline18 } from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import { useKlexBotAnnouncement } from '@ui/components/klex-bot-announcement/controller';
import { KlexBotAnnouncementCardContent } from '@ui/components/klex-bot-announcement/content';
import type { AnnouncementDismissal } from '@shared/klex-bot-announcement';
import { SidebarToast } from '../_components/sidebar-toast';

export function KlexBotAnnouncementCard() {
  const { cardVisible, open, busy, error, dismiss } = useKlexBotAnnouncement();
  const [choiceOpen, setChoiceOpen] = useState(false);
  if (!cardVisible) return null;

  const confirm = async (choice: AnnouncementDismissal) => {
    if (await dismiss(choice)) setChoiceOpen(false);
  };

  return (
    <SidebarToast>
      <Button
        id="klex-bot-announcement-open"
        variant="ghost"
        size="xs"
        className="h-auto w-full flex-col items-stretch justify-start gap-3 whitespace-normal px-1 pt-2 pb-1 text-left"
        aria-label="Say Hello to Klex Bots"
        disabled={busy}
        onClick={open}
      >
        <KlexBotAnnouncementCardContent />
      </Button>
      <Menu
        open={choiceOpen}
        onOpenChange={(next) => {
          if (!busy) setChoiceOpen(next);
        }}
      >
        <MenuTrigger>
          <Button
            variant="ghost"
            size="icon-2xs"
            className="absolute top-1.5 right-1.5"
            aria-label="Dismiss Klex Bot announcement"
            disabled={busy}
          >
            <IconXmarkOutline18 className="size-3" />
          </Button>
        </MenuTrigger>
        <MenuContent side="top" align="end">
          <MenuItem
            closeOnClick={false}
            disabled={busy}
            onClick={() => void confirm('remind')}
          >
            Remind me in 7 days
          </MenuItem>
          <MenuItem
            closeOnClick={false}
            disabled={busy}
            onClick={() => void confirm('never')}
          >
            Don&apos;t show me again
          </MenuItem>
          {error && (
            <p role="alert" className="px-2 py-1 text-error-foreground text-xs">
              {error}
            </p>
          )}
        </MenuContent>
      </Menu>
      {error && !choiceOpen && (
        <p role="alert" className="text-error-foreground text-xs">
          {error}
        </p>
      )}
    </SidebarToast>
  );
}
