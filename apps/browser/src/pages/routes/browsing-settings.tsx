import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@stagewise/stage-ui/components/dialog';
import { produceWithPatches, enablePatches } from 'immer';
import { PlusIcon, Trash2Icon, Loader2Icon } from 'lucide-react';

enablePatches();
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import type { TelemetryLevel } from '@shared/karton-contracts/ui/shared-types';

export const Route = createFileRoute('/browsing-settings')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Browsing Settings',
      },
    ],
  }),
});

function Page() {
  const preferences = useKartonState((s) => s.preferences);
  const searchEngines = useKartonState((s) => s.searchEngines);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);
  const addSearchEngine = useKartonProcedure((s) => s.addSearchEngine);
  const removeSearchEngine = useKartonProcedure((s) => s.removeSearchEngine);

  const telemetryMode = preferences.privacy.telemetryLevel;
  const defaultEngineId = preferences.search.defaultEngineId;

  // Add search engine dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEngine, setNewEngine] = useState({
    name: '',
    url: '',
    keyword: '',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleTelemetryChange = async (value: string) => {
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.privacy.telemetryLevel = value as TelemetryLevel;
    });
    await updatePreferences(patches);
  };

  const handleDefaultEngineChange = async (value: string) => {
    const engineId = Number.parseInt(value, 10);
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.search.defaultEngineId = engineId;
    });
    await updatePreferences(patches);
  };

  const handleAddEngine = async () => {
    setIsAdding(true);
    setAddError(null);

    const result = await addSearchEngine({
      name: newEngine.name,
      url: newEngine.url, // UI sends %s format, backend converts
      keyword: newEngine.keyword,
    });

    setIsAdding(false);

    if (result.success) {
      setIsAddDialogOpen(false);
      setNewEngine({ name: '', url: '', keyword: '' });
    } else {
      setAddError(result.error);
    }
  };

  const handleRemoveEngine = async (id: number) => {
    setDeleteError(null);
    const result = await removeSearchEngine(id);
    if (!result.success) {
      setDeleteError(result.error ?? 'Failed to remove search engine');
    }
  };

  // Validate URL contains %s and is a valid URL
  const isUrlValid =
    newEngine.url.includes('%s') &&
    (() => {
      try {
        new URL(newEngine.url.replace('%s', 'test'));
        return true;
      } catch {
        return false;
      }
    })();

  const canAdd =
    newEngine.name.trim() && newEngine.keyword.trim() && isUrlValid;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border/30 border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">
            Browsing Settings
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent hover:scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 dark:hover:scrollbar-thumb-zinc-500 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Search Engine Section */}
          <section className="space-y-3">
            <div>
              <h2 className="font-medium text-foreground text-lg">General</h2>
            </div>

            {/* Default Engine Selection */}
            <div className="space-y-3">
              <div>
                <h3 className="font-medium text-base text-foreground">
                  Default Search Engine
                </h3>
              </div>

              <RadioGroup
                value={String(defaultEngineId)}
                onValueChange={handleDefaultEngineChange}
              >
                {searchEngines.map((engine) => (
                  <div
                    key={engine.id}
                    className="flex items-center justify-between gap-4"
                  >
                    <RadioLabel className="flex-1">
                      <Radio value={String(engine.id)} />
                      <div className="flex items-center gap-2">
                        {engine.faviconUrl && (
                          <img
                            src={engine.faviconUrl}
                            alt=""
                            className="size-4"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                'none';
                            }}
                          />
                        )}
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {engine.shortName}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {engine.keyword}
                          </span>
                        </div>
                      </div>
                    </RadioLabel>

                    {/* Delete button for custom engines only */}
                    {!engine.isBuiltIn && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveEngine(engine.id)}
                        disabled={engine.id === defaultEngineId}
                        title={
                          engine.id === defaultEngineId
                            ? 'Cannot delete default engine'
                            : 'Remove search engine'
                        }
                      >
                        <Trash2Icon className="size-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </RadioGroup>

              {deleteError && (
                <p className="text-red-500 text-sm">{deleteError}</p>
              )}
            </div>

            {/* Add Custom Engine */}
            <div>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger>
                  <Button variant="secondary" size="sm">
                    <PlusIcon className="mr-2 size-4" />
                    Add Search Engine
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogClose />
                  <DialogHeader>
                    <DialogTitle>Add Search Engine</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="engine-name"
                        className="font-medium text-foreground text-sm"
                      >
                        Name
                      </label>
                      <Input
                        id="engine-name"
                        placeholder="My Search Engine"
                        value={newEngine.name}
                        onValueChange={(value) =>
                          setNewEngine((prev) => ({ ...prev, name: value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="engine-keyword"
                        className="font-medium text-foreground text-sm"
                      >
                        Keyword
                      </label>
                      <Input
                        id="engine-keyword"
                        placeholder="mysearch.com"
                        value={newEngine.keyword}
                        onValueChange={(value) =>
                          setNewEngine((prev) => ({ ...prev, keyword: value }))
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        The keyword used to identify this search engine
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="engine-url"
                        className="font-medium text-foreground text-sm"
                      >
                        Search URL
                      </label>
                      <Input
                        id="engine-url"
                        placeholder="https://example.com/search?q=%s"
                        value={newEngine.url}
                        onValueChange={(value) =>
                          setNewEngine((prev) => ({ ...prev, url: value }))
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        URL with %s where the search query should be inserted
                      </p>
                      {newEngine.url && !isUrlValid && (
                        <p className="text-red-500 text-xs">
                          URL must be valid and contain %s placeholder
                        </p>
                      )}
                    </div>

                    {addError && (
                      <p className="text-red-500 text-sm">{addError}</p>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      variant="primary"
                      onClick={handleAddEngine}
                      disabled={!canAdd || isAdding}
                    >
                      {isAdding ? (
                        <>
                          <Loader2Icon className="mr-2 size-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        'Add Search Engine'
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </section>

          <hr className="border-border/20" />

          {/* Privacy Section */}
          <section className="space-y-6">
            <div>
              <h2 className="font-medium text-foreground text-lg">Privacy</h2>
              <p className="text-muted-foreground text-sm">
                Manage your privacy and data sharing preferences.
              </p>
            </div>

            {/* Telemetry */}
            <div className="space-y-3">
              <div>
                <h3 className="font-medium text-base text-foreground">
                  Telemetry
                </h3>
                <p className="text-muted-foreground text-sm">
                  Control what usage data is collected to help improve
                  stagewise.
                </p>
              </div>

              <RadioGroup
                value={telemetryMode}
                onValueChange={handleTelemetryChange}
              >
                <RadioLabel>
                  <Radio value="full" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Full</span>
                    <span className="text-muted-foreground text-xs">
                      Send all telemetry data including usage patterns and
                      diagnostics
                    </span>
                  </div>
                </RadioLabel>

                <RadioLabel>
                  <Radio value="anonymous" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      Anonymous
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Send anonymized telemetry data without personal
                      identifiers
                    </span>
                  </div>
                </RadioLabel>

                <RadioLabel>
                  <Radio value="off" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Off</span>
                    <span className="text-muted-foreground text-xs">
                      Don't send any telemetry data
                    </span>
                  </div>
                </RadioLabel>
              </RadioGroup>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
