import {
  type ContextMenuParams,
  type WebContents,
  type Event,
  Menu,
  clipboard,
  type MenuItem as ElectronMenuItem,
  type MenuItemConstructorOptions as ElectronMenuItemConstructorOptions,
  type BaseWindow,
} from 'electron';
import type { SearchUtils } from './search-utils';

type MenuItem = ElectronMenuItem | ElectronMenuItemConstructorOptions;

// Utilities for context menu that aren't accessible through the webContents API directly.
export interface ContextMenuUtils {
  openInNewTab: (url: string) => void; // Opens a new tab with the given URL
  searchFor: (query: string, searchEngineId?: number) => void; // Triggers search with configured search engine in new tab
  inspectElement: (x: number, y: number) => void; // Opens the dev tools to inspect the element at the given coordinate
  searchUtils: SearchUtils; // Search utilities for building search URLs and getting engine info
}

export class ContextMenuWebContent {
  private webContents: WebContents;
  private window: BaseWindow;
  private utils: ContextMenuUtils;

  constructor(
    webContents: WebContents,
    window: BaseWindow,
    utils: ContextMenuUtils,
  ) {
    this.webContents = webContents;
    this.window = window;
    this.utils = utils;

    webContents.on('context-menu', this.handleContextMenu);
  }

  private handleContextMenu = (_event: Event, params: ContextMenuParams) => {
    const menu = this.buildMenu(params);

    menu.popup({
      window: this.window,

      // On macOS, we want to show wiritng tools etc. if the context is editable
      ...(process.platform === 'darwin' && params.isEditable
        ? {
            frame: this.webContents.mainFrame,
          }
        : {}),
    });
  };

  private buildMenu(params: ContextMenuParams): Menu {
    // 2D-array of all shown elements.
    const allItems2D: MenuItem[][] = [
      this.buildUrlMenuItems(params),
      this.buildImageRelatedMenuItems(params),
      this.buildBasicEditMenuItems(params),
      this.buildSpellcheckMenuItems(params),
      this.buildStagewiseFeaturesMenuItems(params),
      this.buildSystemMenuItems(params),
    ];

    const allItems: MenuItem[] = allItems2D.reduce((acc, curr) => {
      if (curr.length === 0) return acc;
      if (acc.length > 0) acc.push({ type: 'separator' });
      acc.push(...curr);
      return acc;
    }, [] as MenuItem[]);

    return Menu.buildFromTemplate(allItems);
  }

  private buildSpellcheckMenuItems = (
    params: ContextMenuParams,
  ): MenuItem[] => {
    if (!params.isEditable || !params.spellcheckEnabled) return [];

    const items: MenuItem[] = [
      ...(params.misspelledWord
        ? [
            {
              label: 'Add to dictionary',
              click: () => {
                this.webContents.session.addWordToSpellCheckerDictionary(
                  params.misspelledWord,
                );
              },
            },
          ]
        : []),
      {
        label: `${params.dictionarySuggestions.length === 0 ? 'No ' : ''}Suggestion${params.dictionarySuggestions.length > 1 ? 's' : ''}`,
        type: 'header',
      },
      ...params.dictionarySuggestions.map((suggestion) => ({
        label: suggestion,
        click: () => {
          this.webContents.replaceMisspelling(suggestion);
        },
      })),
    ];

    if (params.dictionarySuggestions.length === 0) return [];

    params.spellcheckEnabled;

    return items;
  };

  private buildBasicEditMenuItems = (params: ContextMenuParams): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: 'Undo',
        visible: params.isEditable,
        enabled: params.editFlags.canUndo,
        click: () => {
          this.webContents.undo();
        },
      },
      {
        label: 'Redo',
        visible: params.editFlags.canRedo,
        click: () => {
          this.webContents.redo();
        },
      },
      {
        type: 'separator',
        visible: params.isEditable,
      },
      {
        label: 'Paste',
        visible: params.editFlags.canPaste && clipboard.readText().length > 0,
        click: () => {
          this.webContents.paste();
        },
      },
      {
        label: 'Select All',
        visible: params.editFlags.canSelectAll,
        click: () => {
          this.webContents.selectAll();
        },
      },
      {
        label: 'Cut',
        visible: params.editFlags.canCut,
        click: () => {
          clipboard.writeText(params.selectionText);
          this.webContents.cut();
        },
      },
      {
        label: 'Copy',
        visible: params.editFlags.canCopy && params.linkURL.length === 0,
        click: () => {
          clipboard.writeText(params.selectionText);
        },
      },
    ];

    return items;
  };

  private buildImageRelatedMenuItems = (
    _params: ContextMenuParams,
  ): MenuItem[] => {
    const items: MenuItem[] = [];

    // TODO

    return items;
  };

  private buildUrlMenuItems = (params: ContextMenuParams): MenuItem[] => {
    if (params.linkURL.length === 0) return [];

    const items: MenuItem[] = [
      {
        label: 'Open in this tab',
        click: () => {
          this.webContents.loadURL(params.linkURL);
        },
      },
      {
        label: 'Open in new tab',
        click: () => {
          this.utils.openInNewTab(params.linkURL);
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Copy URL',
        click: () => {
          clipboard.writeText(params.linkURL);
        },
      },
      {
        label: 'Copy Text',
        click: () => {
          clipboard.writeText(params.selectionText);
        },
      },
    ];

    return items;
  };

  private buildStagewiseFeaturesMenuItems = (
    params: ContextMenuParams,
  ): MenuItem[] => {
    const defaultEngine = this.utils.searchUtils.getDefaultEngine();
    const engineName = defaultEngine?.shortName ?? 'Google';

    const items: MenuItem[] = [
      {
        visible:
          params.selectionText.length > 0 && params.selectionText.length < 512,
        label:
          params.selectionText.length < 20
            ? `Search ${engineName} for "${params.selectionText}"`
            : `Search with ${engineName}`,
        click: () => {
          this.utils.searchFor(params.selectionText);
        },
      },
    ];

    return items;
  };

  private buildSystemMenuItems = (_params: ContextMenuParams): MenuItem[] => {
    const items: MenuItem[] = [];

    return items;
  };
}
