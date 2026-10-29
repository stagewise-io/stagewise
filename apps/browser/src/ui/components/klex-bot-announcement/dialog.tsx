import { ArrowRightIcon } from 'lucide-react';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@stagewise/stage-ui/components/dialog';
import { useKlexBotAnnouncement } from './controller';
import {
  KLEX_BOT_ANNOUNCEMENT_TITLE,
  KlexBotAnnouncementContent,
} from './content';

export function KlexBotAnnouncementDialog() {
  const { dialogOpen, close } = useKlexBotAnnouncement();
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="max-h-[80vh] max-w-2xl gap-4 overflow-hidden sm:w-[calc(100vw-3rem)] sm:min-w-0"
        finalFocus={() => document.getElementById('klex-bot-announcement-open')}
      >
        <DialogClose aria-label="Close Klex Bot announcement" />
        <DialogHeader className="mb-0 shrink-0 pr-7">
          <DialogTitle className="klex-announcement-title text-3xl leading-tight">
            {KLEX_BOT_ANNOUNCEMENT_TITLE}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Meet the stagewise team's open-source digital coworkers.
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-subtle min-h-0 overflow-y-auto">
          <KlexBotAnnouncementContent />
        </div>
        <div className="flex shrink-0 justify-center pt-2">
          <Button
            variant="primary"
            size="md"
            className="rounded-full"
            onClick={() => void openExternalUrl('https://klex.bot')}
          >
            Create your first Klex Bot
            <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
