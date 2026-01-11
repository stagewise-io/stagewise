import type { SearchEngine } from '@shared/karton-contracts/ui/shared-types';

/**
 * Fallback Google search URL template when no search engine is configured.
 * Uses {searchTerms} placeholder like other search engine URL templates.
 */
export const FALLBACK_SEARCH_URL =
  'https://www.google.com/search?q={searchTerms}';

/**
 * Represents a navigation target - either a direct URL or a search query.
 */
export type NavigationTarget =
  | {
      type: 'url';
      url: string;
    }
  | {
      type: 'search';
      query: string;
      /** Optional: specific search engine ID. If not provided, uses default. */
      searchEngineId?: number;
      /** Optional: search engine keyword to use instead of ID. Takes precedence over searchEngineId. */
      searchEngineKeyword?: string;
    };

/**
 * Configuration for search utilities - provides access to search engines and preferences.
 */
export interface SearchUtilsConfig {
  /** Returns all available search engines */
  getSearchEngines: () => SearchEngine[];
  /** Returns the default search engine ID from preferences */
  getDefaultEngineId: () => number;
}

/**
 * Search utilities instance that provides search-related functionality.
 */
export interface SearchUtils {
  /** Builds a search URL for the given query using the default search engine */
  buildSearchUrl: (query: string) => string;
  /** Builds a search URL using a specific search engine by ID */
  buildSearchUrlWithEngineId: (query: string, engineId: number) => string;
  /** Builds a search URL using a specific search engine by keyword */
  buildSearchUrlWithKeyword: (query: string, keyword: string) => string;
  /** Gets the default search engine info */
  getDefaultEngine: () => SearchEngine | null;
  /** Gets a search engine by ID */
  getEngineById: (id: number) => SearchEngine | null;
  /** Gets a search engine by keyword */
  getEngineByKeyword: (keyword: string) => SearchEngine | null;
  /** Resolves a NavigationTarget to a URL string */
  resolveNavigationTarget: (target: NavigationTarget) => string;
}

// Use the exported fallback search URL

/**
 * Replaces the {searchTerms} placeholder in a search URL with the encoded query.
 */
function replaceSearchTerms(urlTemplate: string, query: string): string {
  return urlTemplate.replace('{searchTerms}', encodeURIComponent(query));
}

/**
 * Creates a SearchUtils instance with the given configuration.
 */
export function createSearchUtils(config: SearchUtilsConfig): SearchUtils {
  const getEngineById = (id: number): SearchEngine | null => {
    const engines = config.getSearchEngines();
    return engines.find((e) => e.id === id) ?? null;
  };

  const getEngineByKeyword = (keyword: string): SearchEngine | null => {
    const engines = config.getSearchEngines();
    const lowerKeyword = keyword.toLowerCase();
    return (
      engines.find((e) => e.keyword.toLowerCase() === lowerKeyword) ?? null
    );
  };

  const getDefaultEngine = (): SearchEngine | null => {
    const defaultId = config.getDefaultEngineId();
    return getEngineById(defaultId);
  };

  const buildSearchUrlWithEngineId = (
    query: string,
    engineId: number,
  ): string => {
    const engine = getEngineById(engineId);
    if (engine) {
      return replaceSearchTerms(engine.url, query);
    }
    // Fallback to Google
    return replaceSearchTerms(FALLBACK_SEARCH_URL, query);
  };

  const buildSearchUrlWithKeyword = (
    query: string,
    keyword: string,
  ): string => {
    const engine = getEngineByKeyword(keyword);
    if (engine) {
      return replaceSearchTerms(engine.url, query);
    }
    // Fallback to Google
    return replaceSearchTerms(FALLBACK_SEARCH_URL, query);
  };

  const buildSearchUrl = (query: string): string => {
    const defaultEngine = getDefaultEngine();
    if (defaultEngine) {
      return replaceSearchTerms(defaultEngine.url, query);
    }
    // Fallback to Google
    return replaceSearchTerms(FALLBACK_SEARCH_URL, query);
  };

  const resolveNavigationTarget = (target: NavigationTarget): string => {
    if (target.type === 'url') {
      return target.url;
    }

    // Search target
    if (target.searchEngineKeyword) {
      return buildSearchUrlWithKeyword(
        target.query,
        target.searchEngineKeyword,
      );
    }
    if (target.searchEngineId !== undefined) {
      return buildSearchUrlWithEngineId(target.query, target.searchEngineId);
    }
    return buildSearchUrl(target.query);
  };

  return {
    buildSearchUrl,
    buildSearchUrlWithEngineId,
    buildSearchUrlWithKeyword,
    getDefaultEngine,
    getEngineById,
    getEngineByKeyword,
    resolveNavigationTarget,
  };
}

/**
 * Parses user input and determines if it's a URL or a search query.
 * Returns a NavigationTarget that can be resolved to a final URL.
 *
 * @param input - User input (could be a URL, domain, or search query)
 * @param searchEngineId - Optional: specific search engine ID for searches
 * @param searchEngineKeyword - Optional: search engine keyword for searches
 */
export function parseNavigationInput(
  input: string,
  searchEngineId?: number,
  searchEngineKeyword?: string,
): NavigationTarget {
  const trimmed = input.trim();

  // Check if it starts with stagewise:/ - always treat as URL, never search
  if (trimmed.toLowerCase().startsWith('stagewise:/')) {
    return { type: 'url', url: trimmed };
  }

  // Check if it's already a valid URL with protocol
  try {
    new URL(trimmed);
    return { type: 'url', url: trimmed };
  } catch {
    // Not a valid URL, continue checking
  }

  // Check if it looks like a domain (no spaces, has a dot)
  if (!trimmed.includes(' ') && trimmed.includes('.')) {
    return { type: 'url', url: `https://${trimmed}` };
  }

  // Treat as search query
  return {
    type: 'search',
    query: trimmed,
    searchEngineId,
    searchEngineKeyword,
  };
}
