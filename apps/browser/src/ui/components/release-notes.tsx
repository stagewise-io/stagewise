import { Button } from '@stagewise/stage-ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@stagewise/stage-ui/components/dialog';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import releaseNotesMarkdown from '../../../../../.release-notes.md?raw';

const LAST_SEEN_VERSION_KEY = 'stagewise-whats-new-version';
const releaseNotes = releaseNotesMarkdown.trim();
const hasCurrentReleaseNotes = releaseNotes.startsWith(
  `## ${__APP_VERSION__} (`,
);
const releaseNotesComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

function wasCurrentVersionSeen(): boolean {
  try {
    return localStorage.getItem(LAST_SEEN_VERSION_KEY) === __APP_VERSION__;
  } catch {
    return false;
  }
}

export function markCurrentReleaseNotesSeen(): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, __APP_VERSION__);
  } catch {
    // Show them again on the next launch if storage is unavailable.
  }
}

export function ReleaseNotes({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'space-y-3 text-muted-foreground text-sm',
        '[&_a]:text-primary-foreground [&_a]:underline',
        '[&_code]:font-mono',
        '[&_h2]:font-semibold [&_h2]:text-base [&_h2]:text-foreground',
        '[&_h3]:font-medium [&_h3]:text-foreground',
        '[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5',
        '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
        className,
      )}
    >
      <ReactMarkdown components={releaseNotesComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function WhatsNewDialog() {
  const [open, setOpen] = useState(
    () => hasCurrentReleaseNotes && !wasCurrentVersionSeen(),
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) return;

    markCurrentReleaseNotesSeen();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl gap-4 overflow-hidden">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>What’s new</DialogTitle>
        </DialogHeader>
        <div className="scrollbar-subtle min-h-0 overflow-y-auto rounded-lg bg-surface-1 p-4">
          <ReleaseNotes>{releaseNotes}</ReleaseNotes>
        </div>
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
