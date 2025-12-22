import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
  ClearBrowsingDataOptions,
  ClearBrowsingDataResult,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type PagesApiState = Record<string, never>;

export type PagesApiContract = {
  state: PagesApiState;
  serverProcedures: {
    getHistory: (filter: HistoryFilter) => Promise<HistoryResult[]>;
    getFaviconBitmaps: (
      faviconUrls: string[],
    ) => Promise<Record<string, FaviconBitmapResult>>;
    openTab: (url: string, setActive?: boolean) => Promise<void>;
    clearBrowsingData: (
      options: ClearBrowsingDataOptions,
    ) => Promise<ClearBrowsingDataResult>;
  };
};

export const defaultState: PagesApiState = {};
