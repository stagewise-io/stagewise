import { useEffect, useRef, useState } from 'react';
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
import { BellIcon, GitBranchIcon, TerminalIcon } from 'lucide-react';
import { WorkspacesDark, WorkspacesLight } from '@ui/assets/feature-images';
import { useTrack } from '@ui/hooks/use-track';
import { useKartonProcedure } from '../hooks/use-karton';

const STABLE_DOWNLOAD_URL = 'https://stagewise.io/download';
const stableFeatures = [
  {
    title: 'Worktree support',
    description: 'Run agents across isolated branches without losing context.',
    icon: GitBranchIcon,
  },
  {
    title: 'Agent notification sounds',
    description: 'Know when agents need input or finish long-running work.',
    icon: BellIcon,
  },
  {
    title: 'Built-in terminals',
    description:
      'Keep command output close to the work happening in stagewise.',
    icon: TerminalIcon,
  },
];

export function LegacyPrereleaseBridgeDialog() {
  const [open, setOpen] = useState(true);
  const [downloadClicked, setDownloadClicked] = useState(false);
  const [isOpeningDownload, setIsOpeningDownload] = useState(false);
  const hasTrackedShown = useRef(false);
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const track = useTrack();
  const shouldShow = __APP_RELEASE_CHANNEL__ === 'prerelease';

  useEffect(() => {
    if (!shouldShow || hasTrackedShown.current) return;

    hasTrackedShown.current = true;
    void track('legacy-prerelease-bridge-shown');
  }, [shouldShow, track]);

  if (!shouldShow) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (open && !nextOpen) {
      void track('legacy-prerelease-bridge-dismissed');
    }

    setOpen(nextOpen);
  };

  const handleDownloadStable = async () => {
    if (isOpeningDownload) return;

    setIsOpeningDownload(true);
    void track('legacy-prerelease-bridge-download-clicked');

    try {
      await openExternalUrl(STABLE_DOWNLOAD_URL);
      setDownloadClicked(true);
    } catch {
      setDownloadClicked(false);
    } finally {
      setIsOpeningDownload(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl gap-5 overflow-y-auto p-6 shadow-elevation-2">
        <DialogClose aria-label="Close migration dialog" />

        <DialogHeader className="mb-0 gap-3 pr-8">
          <div className="flex flex-col gap-2">
            <DialogTitle className="text-2xl leading-tight">
              stagewise 1.0.0 is available
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-base leading-relaxed">
              stagewise has graduated from prerelease. Install stagewise 1.0.0
              to keep receiving updates.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="flex flex-col gap-3 rounded-xl border border-derived-subtle bg-surface-1 p-3">
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-background">
              <img
                src={WorkspacesLight}
                alt="stagewise workspaces preview"
                className="block h-auto w-full dark:hidden"
              />
              <img
                src={WorkspacesDark}
                alt="stagewise workspaces preview"
                className="hidden h-auto w-full dark:block"
              />
            </div>
            <div className="px-1 pb-1">
              <h2 className="font-medium text-foreground text-sm">
                What’s new in stable
              </h2>
              <p className="text-muted-foreground text-sm">
                A faster, more capable stagewise with the features from the
                prerelease channel — now on the stable update path.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              {stableFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="font-medium text-foreground text-sm">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <DialogFooter className="mt-0 flex-row items-center justify-between border-border-subtle border-t pt-5">
          <p className="min-w-0 text-muted-foreground text-xs leading-relaxed">
            {downloadClicked
              ? 'Once stagewise 1.0.0 is installed and launches successfully, you can safely remove stagewise (Pre-Release) from your system.'
              : 'Your data persists. You can delete stagewise (Pre-Release) after stable launches successfully.'}
          </p>
          {!downloadClicked && (
            <Button
              size="md"
              onClick={handleDownloadStable}
              disabled={isOpeningDownload}
              className="shrink-0 whitespace-nowrap"
            >
              {isOpeningDownload
                ? 'Opening download…'
                : 'Download stagewise 1.0.0'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
