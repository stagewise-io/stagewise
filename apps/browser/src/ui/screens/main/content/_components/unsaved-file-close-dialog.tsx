import { Button } from '@stagewise/stage-ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@stagewise/stage-ui/components/dialog';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import type { FileTabUnsavedEditEntry } from '../../file-tree/file-tab-unsaved-edits';

type UnsavedFileCloseDialogProps = {
  entry: FileTabUnsavedEditEntry | null;
  onKeepOpen: () => void;
  onCancelWithoutSave: () => void;
  onSaveAndClose: () => Promise<void>;
};

export function UnsavedFileCloseDialog({
  entry,
  onKeepOpen,
  onCancelWithoutSave,
  onSaveAndClose,
}: UnsavedFileCloseDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => !open && onKeepOpen()}
    >
      <DialogContent>
        <DialogClose />
        <DialogHeader>
          <DialogTitle>Unsaved file edits</DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.relativePath} has unsaved edits. What should happen before closing it?`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="primary"
            size="sm"
            disabled={isSaving}
            onClick={() => {
              setIsSaving(true);
              void onSaveAndClose().finally(() => setIsSaving(false));
            }}
          >
            {isSaving ? (
              <Loader2Icon className="mr-2 size-3 animate-spin" />
            ) : null}
            Save and close
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancelWithoutSave}
            disabled={isSaving}
          >
            Close without save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
