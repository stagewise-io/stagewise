import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import type { SearchEngine } from '@shared/karton-contracts/ui/shared-types';
import type { OmniboxSuggestions } from '@shared/karton-contracts/ui';
import {
  IconMagnifierOutline18,
  IconRefreshAnticlockwiseOutline18,
  IconGlobe3Outline18,
  IconWindowCodeOutline18,
} from '@stagewise/icons';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { useDebouncedValue } from '@ui/hooks/use-debounced-value';

/**
 * Determines if the input is a URL or search query, and returns the appropriate URL.
 *
 * @param input - User input from the omnibox
 * @param searchEngines - Available search engines
 * @param defaultEngineId - ID of the default search engine
 * @param searchEngineId - Optional: specific search engine ID to use
 * @param searchEngineKeyword - Optional: search engine keyword to use (takes precedence)
 */
export function convertOmniboxInputToUrl(
  input: string,
  searchEngines: SearchEngine[],
  defaultEngineId: number,
  searchEngineId?: number,
  searchEngineKeyword?: string,
): string {
  const trimmed = input.trim();

  const category = categorizeUrlInput(input);
  if (category === 'url') {
    return input;
  }

  if (category === 'url-like') {
    // Use http:// for localhost and other local addresses
    if (
      input.startsWith('localhost:') ||
      input.startsWith('localhost/') ||
      input === 'localhost' ||
      input.startsWith('127.0.0.1:') ||
      input.startsWith('127.0.0.1/') ||
      input === '127.0.0.1' ||
      input.startsWith('::1:') ||
      input.startsWith('::1/') ||
      input === '::1' ||
      input.startsWith('[::1]:') ||
      input.startsWith('[::1]/') ||
      input === '[::1]'
    ) {
      return `http://${input}`;
    }
    return `https://${input}`;
  }

  // We first get the matching engine
  const engine = (() => {
    if (searchEngineKeyword) {
      const lowerKeyword = searchEngineKeyword.toLowerCase();
      return searchEngines.find(
        (e) => e.keyword.toLowerCase() === lowerKeyword,
      );
    } else if (searchEngineId !== undefined) {
      return searchEngines.find((e) => e.id === searchEngineId);
    } else {
      return searchEngines.find((e) => e.id === defaultEngineId);
    }
  })();

  // Check if we have no valid search engine (force to create an url)
  if (!engine) {
    return `https://${encodeURIComponent(trimmed)}`;
  }

  return engine.url.replace('{searchTerms}', encodeURIComponent(trimmed));
}

export function categorizeUrlInput(
  input: string,
): 'url' | 'url-like' | 'search' {
  // Check if it starts with stagewise:/ - always treat as URL
  if (input.toLowerCase().startsWith('stagewise:/')) {
    return 'url';
  }

  // Check if it's already a valid URL with a known web protocol
  try {
    const parsedUrl = new URL(input);
    const knownProtocols = ['http:', 'https:', 'file:', 'stagewise:'];
    // Only treat as valid URL if it has a known web protocol
    if (knownProtocols.includes(parsedUrl.protocol)) {
      return 'url';
    }
    // Otherwise fall through to other checks (might be localhost:port pattern)
  } catch {
    // Not a valid URL, continue checking
  }

  // Check if it looks like a domain (no spaces, has a dot)
  if (
    !input.includes(' ') &&
    input.split('.').filter((p) => p.length > 0).length > 1
  ) {
    return 'url-like';
  }

  // Check for localhost and other local addresses (with optional port)
  if (
    !input.includes(' ') &&
    (/^localhost(:\d+)?(\/|$)/i.test(input) ||
      /^127\.0\.0\.1(:\d+)?(\/|$)/.test(input) ||
      /^::1(:\d+)?(\/|$)/.test(input) ||
      /^\[::1\](:\d+)?(\/|$)/.test(input))
  ) {
    return 'url-like';
  }

  return 'search';
}

export type OmniboxSuggestionGroup = {
  key: string;
  label?: ReactNode;
  items: OmniboxSuggestionItem[];
};

// Internally used type for omnibox suggestions. Every suggestion will be rendered differently based on the type.
export type OmniboxSuggestionItem = {
  type:
    | 'reload-same-page'
    | 'page-nav-suggestion'
    | 'search-suggestion'
    | 'past-search'
    | 'past-page'
    | 'local-page';
  value: string; // The actual value of the entry (always an URL) (base-ui default key)
  label?: string; // The value to be displayed in the input (may be different from the value for searches) (base-ui default key)
  suggestionLabel?: string | ReactNode; // The label to be displayed in the suggestion
  suggestionIcon?: ReactNode; // The icon to be displayed in the suggestion
  unselectable?: boolean; // If true, don't show hover/highlight styles and ignore clicks etc.
};

function FaviconIcon({
  src,
  fallback,
  className,
}: {
  src: string;
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function useOmniboxSuggestions(
  currentUrl: string | undefined,
  input: string,
  searchEngines: SearchEngine[],
  defaultEngineId: number,
  searchEngineId?: number,
  searchEngineKeyword?: string,
): {
  groups: OmniboxSuggestionGroup[];
  resetSuggestions: () => void;
} {
  const getSuggestions = useKartonProcedure((p) => p.getOmniboxSuggestions);

  // Separate state for search suggestions (non-empty input) and default suggestions (empty input).
  // This prevents stale search results from bleeding into the empty-input view and vice versa.
  const [searchSuggestions, setSearchSuggestions] =
    useState<OmniboxSuggestions | null>(null);
  const [defaultSuggestions, setDefaultSuggestions] =
    useState<OmniboxSuggestions | null>(null);

  const debouncedInput = useDebouncedValue(input, 150);
  const isEmptyInput = input.trim() === '';

  // Fetch default suggestions immediately when input is empty (no debounce needed).
  // Runs on mount and whenever the input transitions back to empty.
  useEffect(() => {
    if (isEmptyInput) {
      let cancelled = false;
      getSuggestions('').then((result) => {
        if (!cancelled) setDefaultSuggestions(result);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [isEmptyInput]);

  // Fetch search suggestions based on debounced input (non-empty only).
  useEffect(() => {
    if (debouncedInput.trim() !== '') {
      let cancelled = false;
      getSuggestions(debouncedInput).then((result) => {
        if (!cancelled) setSearchSuggestions(result);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [debouncedInput]);

  const resetSuggestions = useCallback(() => {
    setSearchSuggestions(null);
  }, []);

  const groups = useMemo(() => {
    // Use default suggestions when input is empty, search suggestions otherwise.
    const suggestions = isEmptyInput ? defaultSuggestions : searchSuggestions;
    const inputType = isEmptyInput ? 'search' : categorizeUrlInput(input);

    const changed = currentUrl !== input;

    const engine = (() => {
      if (searchEngineKeyword) {
        const lowerKeyword = searchEngineKeyword.toLowerCase();
        return searchEngines.find(
          (e) => e.keyword.toLowerCase() === lowerKeyword,
        );
      } else if (searchEngineId !== undefined) {
        return searchEngines.find((e) => e.id === searchEngineId);
      } else {
        return searchEngines.find((e) => e.id === defaultEngineId);
      }
    })();

    const localPortsGroup: OmniboxSuggestionGroup = {
      key: 'local-ports',
      label: (
        <span className="inline-flex items-center gap-1.5">
          Running locally
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
          </span>
        </span>
      ),
      items:
        suggestions?.localPorts?.map((entry) => ({
          type: 'local-page' as const,
          value: entry.url,
          label: entry.url,
          suggestionLabel: (
            <span className="truncate">
              <strong>localhost:{entry.port}</strong>
              {entry.lastTitle && (
                <>
                  {' '}
                  <span className="text-muted-foreground">
                    {entry.lastTitle}
                  </span>
                </>
              )}
            </span>
          ),
          suggestionIcon:
            entry.faviconUrl && entry.faviconUrl.length > 0 ? (
              <FaviconIcon
                src={entry.faviconUrl}
                className="size-4"
                fallback={
                  <IconWindowCodeOutline18 className="size-4 text-muted-foreground" />
                }
              />
            ) : (
              <IconWindowCodeOutline18 className="size-4 text-muted-foreground" />
            ),
        })) ?? [],
    };

    // When input is empty, only show default suggestions (most visited & frequent searches)
    if (isEmptyInput) {
      const items: OmniboxSuggestionGroup[] = [
        {
          key: 'search-placeholder',
          items: [
            {
              type: 'search-suggestion' as const,
              value: '',
              label: '',
              suggestionLabel: (
                <span className="text-muted-foreground">
                  Search or enter a URL
                </span>
              ),
              suggestionIcon: (
                <IconMagnifierOutline18 className="size-4 text-muted-foreground" />
              ),
              unselectable: true,
            },
          ],
        },
        localPortsGroup,
        {
          key: 'most-visited',
          label: 'Most visited',
          items:
            suggestions?.mostVisitedOrigins?.map((entry) => {
              let hostname: string;
              try {
                hostname = new URL(entry.origin).host;
              } catch {
                hostname = entry.origin;
              }
              return {
                type: 'past-page' as const,
                value: entry.origin,
                label: entry.origin,
                suggestionLabel: (
                  <span className="truncate">
                    <strong>{hostname}</strong>
                  </span>
                ),
                suggestionIcon:
                  entry.faviconUrl && entry.faviconUrl.length > 0 ? (
                    <FaviconIcon
                      src={entry.faviconUrl}
                      className="size-4"
                      fallback={
                        <IconGlobe3Outline18 className="size-4 text-muted-foreground" />
                      }
                    />
                  ) : (
                    <IconGlobe3Outline18 className="size-4 text-muted-foreground" />
                  ),
              };
            }) ?? [],
        },
        ...(engine
          ? [
              {
                key: 'frequent-searches',
                label: 'Frequent searches',
                items:
                  suggestions?.searchTerms.map((entry) => ({
                    type: 'past-search' as const,
                    value: getSearchUrl(entry.term, engine),
                    label: entry.term,
                    suggestionLabel: <strong>{entry.term}</strong>,
                    suggestionIcon: (
                      <IconMagnifierOutline18 className="size-4 text-muted-foreground" />
                    ),
                  })) ?? [],
              },
            ]
          : []),
      ];
      return items;
    }

    const items: OmniboxSuggestionGroup[] = [
      ...(!changed && currentUrl && currentUrl.length > 0
        ? [
            {
              key: 'reload',
              items: [
                {
                  type: 'reload-same-page' as const,
                  value: input,
                  label: input,
                  suggestionIcon: (
                    <IconRefreshAnticlockwiseOutline18 className="size-4 text-muted-foreground" />
                  ),
                  suggestionLabel: <span>Reload current page</span>,
                },
              ],
            },
          ]
        : []),
      ...(changed &&
      (inputType === 'url' || inputType === 'url-like' || !engine)
        ? [
            {
              key: 'page-nav',
              items: [
                {
                  type: 'page-nav-suggestion' as const,
                  value: getSimplePageNavUrl(input),
                  label: input,
                  suggestionLabel: (
                    <span>
                      Open <strong>{input.trim()}</strong>
                    </span>
                  ),
                  suggestionIcon: (
                    <IconGlobe3Outline18 className="size-4 text-muted-foreground" />
                  ),
                },
              ],
            },
          ]
        : []),
      ...(changed && inputType === 'search' && engine
        ? [
            {
              key: 'search-suggestion',
              items: [
                {
                  type: 'search-suggestion' as const,
                  value: getSearchUrl(input, engine),
                  label: input,
                  suggestionLabel: (
                    <span className="text-muted-foreground">
                      Search for "
                      <strong className="text-foreground">
                        {input.trim()}
                      </strong>
                      " with {engine.shortName}
                    </span>
                  ),
                  suggestionIcon: (
                    <FaviconIcon
                      src={engine.faviconUrl}
                      className="size-4"
                      fallback={
                        <IconMagnifierOutline18 className="size-4 text-muted-foreground" />
                      }
                    />
                  ),
                },
              ],
            },
          ]
        : []),
      localPortsGroup,
      {
        key: 'recent-pages',
        label: 'Recent pages',
        items:
          suggestions?.historyEntries.map((entry) => ({
            type: 'past-page' as const,
            value: entry.url,
            label: entry.url,
            suggestionLabel: (
              <span className="truncate">
                <strong className="max-w-1/2 truncate">{entry.title}</strong>{' '}
                <span className="text-muted-foreground">{entry.url}</span>
              </span>
            ),
            suggestionIcon:
              entry.faviconUrl && entry.faviconUrl.length > 0 ? (
                <FaviconIcon
                  src={entry.faviconUrl}
                  className="size-4"
                  fallback={
                    <IconGlobe3Outline18 className="size-4 text-muted-foreground" />
                  }
                />
              ) : (
                <IconGlobe3Outline18 className="size-4 text-muted-foreground" />
              ),
          })) ?? [],
      },
      ...(engine
        ? [
            {
              key: 'recent-searches',
              label: 'Recent searches',
              items:
                suggestions?.searchTerms.map((entry) => ({
                  type: 'past-search' as const,
                  value: getSearchUrl(entry.term, engine),
                  label: entry.term,
                  suggestionLabel: <strong>{entry.term}</strong>,
                  suggestionIcon: (
                    <IconMagnifierOutline18 className="size-4 text-muted-foreground" />
                  ),
                })) ?? [],
            },
          ]
        : []),
    ];
    return items;
  }, [
    currentUrl,
    input,
    isEmptyInput,
    searchEngines,
    defaultEngineId,
    searchEngineId,
    searchEngineKeyword,
    searchSuggestions,
    defaultSuggestions,
  ]);

  return {
    groups,
    resetSuggestions,
  };
}

function getSimplePageNavUrl(input: string): string {
  const category = categorizeUrlInput(input);

  if (category === 'url') {
    return input;
  }

  if (category === 'url-like') {
    // Use http:// for localhost and other local addresses
    if (
      input.startsWith('localhost:') ||
      input.startsWith('localhost/') ||
      input === 'localhost' ||
      input.startsWith('127.0.0.1:') ||
      input.startsWith('127.0.0.1/') ||
      input === '127.0.0.1' ||
      input.startsWith('::1:') ||
      input.startsWith('::1/') ||
      input === '::1' ||
      input.startsWith('[::1]:') ||
      input.startsWith('[::1]/') ||
      input === '[::1]'
    ) {
      return `http://${input}`;
    }
    return `https://${input}`;
  }

  return `https://${encodeURIComponent(input)}`;
}

function getSearchUrl(input: string, searchEngine: SearchEngine): string {
  return searchEngine.url.replace('{searchTerms}', encodeURIComponent(input));
}
