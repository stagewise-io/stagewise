// This hook manages the state of the companion app. It provides information about all high level stuff that affects what components are rendered etc.

// This hook provides information to all components about whether certain parts of the companion layout should be rendered or not.
// Components can use this information to hide themselves or show additional information.

import { DropAreaZone } from "@/components/toolbar/desktop-only/drop-zones";
import { createRef, RefObject } from "preact";
import { create, StateCreator } from "zustand";
import SuperJSON from "superjson";
import { persist, PersistStorage } from "zustand/middleware";

export enum ResolvedFilter {
  ALL,
  RESOLVED,
  UNRESOLVED,
}

export interface AppState {
  requestMainAppBlock: () => number;
  requestMainAppUnblock: () => number;
  discardMainAppBlock: (handle: number) => void;
  discardMainAppUnblock: (handle: number) => void;

  isMainAppBlocked: boolean;

  toolbarPosition: (typeof DropAreaZone)[keyof typeof DropAreaZone];
  setToolbarPosition: (
    position: (typeof DropAreaZone)[keyof typeof DropAreaZone]
  ) => void;

  toolbarBoxRef: RefObject<HTMLElement | null>; // used to place popovers in case the reference is not available
  setToolbarBoxRef: (ref: RefObject<HTMLElement | null>) => void;
  unsetToolbarBoxRef: () => void;

  minimized: boolean;
  minimize: () => void;
  expand: () => void;

  promotedOnStartup: boolean; // This will be false initially, but will be set to true for the next re-hydration fo the store. If allows components to read and create an additional promoting animation.
  promotionFinished: () => void;
}

export interface InternalAppState extends AppState {
  appBlockRequestList: number[];
  appUnblockRequestList: number[];
  lastBlockRequestNumber: number;
  lastUnblockRequestNumber: number;
}

const createAppStore: StateCreator<AppState> = (s) => {
  const set = s as (
    partial:
      | InternalAppState
      | Partial<InternalAppState>
      | ((
          state: InternalAppState
        ) => InternalAppState | Partial<InternalAppState>),
    replace?: boolean | undefined
  ) => void;
  return {
    appBlockRequestList: [],
    appUnblockRequestList: [],
    lastBlockRequestNumber: 0,
    lastUnblockRequestNumber: 0,

    isMainAppBlocked: false,

    requestMainAppBlock: () => {
      let newHandleValue = 0;
      set((state) => {
        newHandleValue = state.lastBlockRequestNumber + 1;
        return {
          appBlockRequestList: [...state.appBlockRequestList, newHandleValue],
          lastBlockRequestNumber: newHandleValue,
          isMainAppBlocked: state.appUnblockRequestList.length === 0, // Unblock requests override block requests
        };
      });
      return newHandleValue;
    },
    requestMainAppUnblock: () => {
      let newHandleValue = 0;
      set((state) => {
        newHandleValue = state.lastUnblockRequestNumber + 1;
        return {
          appUnblockRequestList: [
            ...state.appUnblockRequestList,
            newHandleValue,
          ],
          lastUnblockRequestNumber: newHandleValue,
          isMainAppBlocked: false,
        };
      });
      return newHandleValue;
    },

    discardMainAppBlock: (handle: number) => {
      set((state) => {
        const newBlockRequestList = state.appBlockRequestList.filter(
          (h) => h !== handle
        );
        return {
          appBlockRequestList: newBlockRequestList,
          isMainAppBlocked:
            newBlockRequestList.length > 0 &&
            state.appUnblockRequestList.length === 0,
        };
      });
    },

    discardMainAppUnblock: (handle: number) => {
      set((state) => {
        const newUnblockRequestList = state.appUnblockRequestList.filter(
          (h) => h !== handle
        );
        return {
          appUnblockRequestList: newUnblockRequestList,
          isMainAppBlocked:
            state.appBlockRequestList.length > 0 &&
            newUnblockRequestList.length === 0,
        };
      });
    },

    toolbarPosition: DropAreaZone.BOTTOM_CENTER,
    setToolbarPosition: (
      position: (typeof DropAreaZone)[keyof typeof DropAreaZone]
    ) => set(() => ({ toolbarPosition: position })),

    toolbarBoxRef: createRef(),
    setToolbarBoxRef: (ref) => set(() => ({ toolbarBoxRef: ref })),
    unsetToolbarBoxRef: () => set(() => ({ toolbarBoxRef: createRef() })),

    minimized: false,
    minimize: () => set(() => ({ minimized: true })),
    expand: () => set(() => ({ minimized: false })),

    promotedOnStartup: false,
    promotionFinished: () => set(() => ({ promotedOnStartup: true })),
  };
};

function createSuperJSONStorage<T>(storage: Storage): PersistStorage<T> {
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      return SuperJSON.parse(str);
    },
    setItem: (name, value) => {
      storage.setItem(name, SuperJSON.stringify(value));
    },
    removeItem: (name) => storage.removeItem(name),
  };
}

export const useAppState = create(
  persist(createAppStore, {
    name: "stgws:companion",
    storage: createSuperJSONStorage(sessionStorage),
    partialize: (state) => {
      return {
        toolbarPosition: state.toolbarPosition,
      };
    },
  })
);
