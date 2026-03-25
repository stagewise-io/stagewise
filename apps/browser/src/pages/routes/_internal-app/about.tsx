import { createFileRoute } from '@tanstack/react-router';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { produceWithPatches, enablePatches } from 'immer';
import type { UpdateChannel } from '@shared/karton-contracts/ui/shared-types';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogHeader,
} from '@stagewise/stage-ui/components/dialog';
import { Input } from '@stagewise/stage-ui/components/input';
import { ExternalLinkIcon, ScrollTextIcon } from 'lucide-react';
import { IconGithub } from 'nucleo-social-media';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import agplLicenseText from '@assets/agpl-3.0-license.txt?raw';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

enablePatches();

export const Route = createFileRoute('/_internal-app/about')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'About',
      },
    ],
  }),
});

interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  repository: string;
  publisher: string;
  licenseText: string;
}

function UpdateChannelSetting() {
  const preferences = useKartonState((s) => s.preferences);
  const appInfo = useKartonState((s) => s.appInfo);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  const inferredChannel: UpdateChannel = appInfo.version.includes('-alpha')
    ? 'alpha'
    : 'beta';

  const currentChannel = preferences.updateChannel ?? inferredChannel;

  const handleChannelChange = async (value: string) => {
    const channel = value as UpdateChannel;
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.updateChannel = channel;
    });
    await updatePreferences(patches);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-base text-foreground">
          Update Channel
        </h3>
        <p className="text-muted-foreground text-sm">
          Choose which pre-release channel to receive updates from.
        </p>
      </div>

      <RadioGroup value={currentChannel} onValueChange={handleChannelChange}>
        <RadioLabel>
          <Radio value="beta" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Beta</span>
            <span className="text-muted-foreground text-xs">
              More stable pre-release updates
            </span>
          </div>
        </RadioLabel>

        <RadioLabel>
          <Radio value="alpha" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Alpha</span>
            <span className="text-muted-foreground text-xs">
              Bleeding-edge updates including alpha and beta releases
            </span>
          </div>
        </RadioLabel>
      </RadioGroup>
    </div>
  );
}

function LicenseTextDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: LicenseEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl gap-4.5 overflow-hidden">
        <DialogClose />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 pt-1">
            {entry.name}@{entry.version}
            <span className="rounded-md bg-surface-1 px-2 py-0.5 font-mono text-muted-foreground text-xs">
              {entry.license}
            </span>
            {entry.repository && (
              <Tooltip>
                <TooltipTrigger>
                  <a
                    href={entry.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-md' }),
                      'w-min p-0',
                    )}
                    aria-label="GitHub Repository"
                  >
                    <IconGithub className="size-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>{entry.repository}</TooltipContent>
              </Tooltip>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface-1 p-4">
          {entry.licenseText ? (
            <pre className="whitespace-pre-wrap font-mono text-foreground text-xs leading-relaxed">
              {entry.licenseText}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              No license text available for this package.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OpenSourceLicenses() {
  const [licenses, setLicenses] = useState<LicenseEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<LicenseEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadLicenses = useCallback(async () => {
    if (licenses) {
      setExpanded(true);
      return;
    }
    setLoading(true);
    try {
      const data = await import('@pages/generated/licenses.json');
      setLicenses(data.default as LicenseEntry[]);
      setExpanded(true);
    } catch {
      console.error('Failed to load license data');
    } finally {
      setLoading(false);
    }
  }, [licenses]);

  const filteredLicenses = useMemo(() => {
    if (!licenses) return [];
    if (!search.trim()) return licenses;
    const q = search.toLowerCase();
    return licenses.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.license.toLowerCase().includes(q),
    );
  }, [licenses, search]);

  const licenseSummary = useMemo(() => {
    if (!licenses) return null;
    const counts: Record<string, number> = {};
    for (const entry of licenses) {
      counts[entry.license] = (counts[entry.license] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [licenses]);

  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [expanded]);

  const handleViewLicense = useCallback((entry: LicenseEntry) => {
    setSelectedEntry(entry);
    setDialogOpen(true);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-base text-foreground">
            Open Source Licenses
          </h3>
          <p className="text-muted-foreground text-sm">
            This software incorporates open source packages. View their licenses
            below.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={expanded ? () => setExpanded(false) : loadLicenses}
          disabled={loading}
        >
          {loading ? 'Loading...' : expanded ? 'Collapse' : 'View All'}
        </Button>
      </div>

      {expanded && licenses && (
        <div ref={listRef} className="flex flex-col gap-3">
          {licenseSummary && (
            <div className="flex flex-wrap gap-2">
              {licenseSummary.map(([license, count]) => (
                <span
                  key={license}
                  className="rounded-md bg-surface-1 px-2 py-1 text-muted-foreground text-xs"
                >
                  {license}{' '}
                  <span className="font-medium text-foreground">{count}</span>
                </span>
              ))}
              <span className="rounded-md bg-surface-1 px-2 py-1 text-muted-foreground text-xs">
                Total{' '}
                <span className="font-medium text-foreground">
                  {licenses.length}
                </span>
              </span>
            </div>
          )}

          <Input
            size="sm"
            value={search}
            onValueChange={(val) => setSearch(val as string)}
            debounce={150}
            placeholder="Search packages or licenses..."
          />

          <div className="scrollbar-subtle h-[400px] overflow-y-auto rounded-lg border border-border-subtle">
            {filteredLicenses.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                No packages found matching &ldquo;{search}&rdquo;
              </div>
            ) : (
              filteredLicenses.map((entry) => (
                <div
                  key={`${entry.name}@${entry.version}`}
                  className="flex items-center justify-between border-border-subtle border-b px-4 py-2.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-foreground text-sm">
                        {entry.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {entry.version}
                        {entry.publisher && ` · ${entry.publisher}`}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-md bg-surface-1 px-2 py-0.5 font-mono text-muted-foreground text-xs">
                      {entry.license}
                    </span>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    {entry.repository && (
                      <a
                        href={entry.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({
                            variant: 'ghost',
                            size: 'icon-xs',
                          }),
                        )}
                        title="View repository"
                      >
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleViewLicense(entry)}
                      title="View license text"
                    >
                      <ScrollTextIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <LicenseTextDialog
        entry={selectedEntry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

function Page() {
  const appInfo = useKartonState((s) => s.appInfo);
  const [appLicenseOpen, setAppLicenseOpen] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex flex-col items-center border-border/30 border-b px-6 py-4">
        <div className="w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">About</h1>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-subtle flex w-full flex-1 flex-col items-center overflow-y-auto px-6 pt-6 pb-24">
        <div className="flex w-full max-w-3xl shrink-0 flex-col gap-8">
          {/* App Name Section */}
          <div className="flex flex-col gap-2">
            <h2 className="font-bold text-3xl text-foreground">
              {appInfo.name}
            </h2>
            <div className="flex flex-col gap-1">
              <p className="text-lg text-muted-foreground">
                {appInfo.baseName}
              </p>
              <p className="text-lg text-muted-foreground">
                Version {appInfo.version}
              </p>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-border/30" />

          {/* Update Channel Setting (only for prerelease builds) */}
          {appInfo.releaseChannel === 'prerelease' && (
            <>
              <UpdateChannelSetting />
              <hr className="border-border/30" />
            </>
          )}

          {/* Details Section */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-y-3">
              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Bundle ID
                </span>
                <span className="break-all text-foreground text-sm">
                  {appInfo.bundleId}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Release Channel
                </span>
                <span className="text-foreground text-sm capitalize">
                  {appInfo.releaseChannel}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Platform
                </span>
                <span className="text-foreground text-sm capitalize">
                  {appInfo.platform}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Architecture
                </span>
                <span className="text-foreground text-sm">{appInfo.arch}</span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Author
                </span>
                <span className="text-foreground text-sm">
                  {appInfo.author}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Copyright
                </span>
                <span className="text-foreground text-sm">
                  {appInfo.copyright}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  License
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground text-sm">
                    AGPL-3.0
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setAppLicenseOpen(true);
                    }}
                    title="View full license text"
                  >
                    <ScrollTextIcon className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Homepage
                </span>
                <a
                  href={appInfo.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: 'link', size: 'sm' }),
                    'w-min p-0',
                  )}
                >
                  {appInfo.homepage}
                </a>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Other Versions
                </span>
                <div className="text-foreground text-sm">
                  {Object.entries(appInfo.otherVersions).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value ?? 'N/A'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-border/30" />

          {/* Open Source Licenses */}
          <OpenSourceLicenses />
        </div>
      </div>

      <LicenseTextDialog
        entry={{
          name: appInfo.name,
          version: appInfo.version,
          license: 'AGPL-3.0',
          repository: 'https://github.com/stagewise/stagewise',
          publisher: 'stagewise Inc.',
          licenseText: agplLicenseText,
        }}
        open={appLicenseOpen}
        onOpenChange={setAppLicenseOpen}
      />
    </div>
  );
}
