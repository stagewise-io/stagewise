import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { useKartonProcedure } from '@/hooks/use-karton';
import { Loader2Icon } from 'lucide-react';

export const Route = createFileRoute('/_internal-app/clear-data')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Clear Data',
      },
    ],
  }),
});

type DataType =
  | 'history'
  | 'favicons'
  | 'downloads'
  | 'cookies'
  | 'cache'
  | 'storage'
  | 'indexedDB'
  | 'serviceWorkers'
  | 'cacheStorage';

interface DataOption {
  id: DataType;
  label: string;
  description: string;
}

const dataOptions: DataOption[] = [
  {
    id: 'history',
    label: 'Browsing history',
    description: 'URLs, visits, and search terms',
  },
  {
    id: 'downloads',
    label: 'Download history',
    description: 'List of downloaded files (not the files themselves)',
  },
  {
    id: 'cookies',
    label: 'Cookies',
    description: 'Site cookies and login sessions',
  },
  {
    id: 'cache',
    label: 'Cached images and files',
    description: 'HTTP cache for faster page loading',
  },
  {
    id: 'storage',
    label: 'Local storage',
    description: 'localStorage and sessionStorage data',
  },
  {
    id: 'indexedDB',
    label: 'IndexedDB',
    description: 'Structured data stored by websites',
  },
  {
    id: 'cacheStorage',
    label: 'Cache Storage',
    description: 'Cache API storage used by web apps',
  },
  {
    id: 'serviceWorkers',
    label: 'Service Workers',
    description: 'Background scripts that power offline functionality',
  },
  {
    id: 'favicons',
    label: 'Cached favicons',
    description: 'Site icons and images',
  },
];

function Page() {
  const [selectedTypes, setSelectedTypes] = useState<Set<DataType>>(
    new Set([
      'history',
      'downloads',
      'cookies',
      'cache',
      'storage',
      'indexedDB',
      'cacheStorage',
      'serviceWorkers',
      'favicons',
    ] as const),
  );
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const clearBrowsingData = useKartonProcedure((s) => s.clearBrowsingData);

  const toggleDataType = (type: DataType) => {
    setSelectedTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const handleClearData = async (timeRange: 'last24h' | 'allTime') => {
    if (selectedTypes.size === 0) {
      setResult({
        success: false,
        message: 'Please select at least one data type to clear',
      });
      return;
    }

    setIsClearing(true);
    setResult(null);

    try {
      const now = new Date();
      const options = {
        history: selectedTypes.has('history'),
        favicons: selectedTypes.has('favicons'),
        downloads: selectedTypes.has('downloads'),
        cookies: selectedTypes.has('cookies'),
        cache: selectedTypes.has('cache'),
        storage: selectedTypes.has('storage'),
        indexedDB: selectedTypes.has('indexedDB'),
        serviceWorkers: selectedTypes.has('serviceWorkers'),
        cacheStorage: selectedTypes.has('cacheStorage'),
        timeRange:
          timeRange === 'last24h'
            ? {
                start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                end: now,
              }
            : undefined,
        vacuum: true,
      };

      const response = await clearBrowsingData(options);

      if (response.success) {
        const clearedItems: string[] = [];
        if (response.historyEntriesCleared) {
          clearedItems.push(
            `${response.historyEntriesCleared} history ${response.historyEntriesCleared === 1 ? 'entry' : 'entries'}`,
          );
        }
        if (response.downloadsCleared) {
          clearedItems.push(
            `${response.downloadsCleared} download ${response.downloadsCleared === 1 ? 'entry' : 'entries'}`,
          );
        }
        if (response.faviconsCleared) {
          clearedItems.push(`${response.faviconsCleared} favicons`);
        }
        if (response.cookiesCleared) {
          clearedItems.push('cookies');
        }
        if (response.cacheCleared) {
          clearedItems.push('cache');
        }
        if (response.storageCleared) {
          clearedItems.push('storage');
        }

        setResult({
          success: true,
          message:
            clearedItems.length > 0
              ? `Successfully cleared ${clearedItems.join(', ')}`
              : 'Data cleared successfully',
        });
      } else {
        setResult({
          success: false,
          message: response.error || 'Failed to clear data',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to clear data',
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-derived-subtle border-b bg-background px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">Clear Data</h1>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-subtle flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Data Selection Section */}
          <section className="space-y-4">
            <div>
              <h2 className="font-medium text-foreground text-lg">
                Select data to clear
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {dataOptions.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer select-none items-start gap-3 rounded-lg border border-derived-subtle bg-background p-2.5 transition-colors hover:bg-hover-derived"
                  htmlFor={option.id}
                >
                  <Checkbox
                    id={option.id}
                    checked={selectedTypes.has(option.id)}
                    onCheckedChange={() => toggleDataType(option.id)}
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 flex-col">
                    <span className="text-foreground text-sm">
                      {option.label}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {option.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Action Buttons */}
          <section>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => handleClearData('last24h')}
                disabled={isClearing || selectedTypes.size === 0}
                variant="secondary"
                size="sm"
              >
                {isClearing ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear last 24 hours'
                )}
              </Button>

              <Button
                onClick={() => handleClearData('allTime')}
                disabled={isClearing || selectedTypes.size === 0}
                variant="primary"
                size="sm"
              >
                {isClearing ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear all time'
                )}
              </Button>
            </div>
          </section>

          {/* Result Message */}
          {result && (
            <div
              className={`rounded-lg border p-4 ${
                result.success
                  ? 'border border-derived bg-success-background text-success-foreground'
                  : 'border border-derived bg-error-background text-error-foreground'
              }`}
            >
              <p className="text-sm">{result.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
