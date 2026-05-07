import type { KartonService } from '../karton';
import type { TabController } from './tab-controller';
import type { SelectedElement } from '@shared/selected-elements';
import type { AppState } from '@shared/karton-contracts/ui';

export class ChatStateController {
  private uiKarton: KartonService;
  private tabs: Record<string, TabController>;
  private getActiveBrowserGroupId: () => string;

  constructor(
    uiKarton: KartonService,
    tabs: Record<string, TabController>,
    getActiveBrowserGroupId: () => string,
  ) {
    this.uiKarton = uiKarton;
    this.tabs = tabs;
    this.getActiveBrowserGroupId = getActiveBrowserGroupId;
  }

  /**
   * Update the tabs reference when tabs are added or removed.
   * This is called by WindowLayoutService to keep the reference in sync.
   */
  public updateTabsReference(tabs: Record<string, TabController>) {
    this.tabs = tabs;
  }

  /**
   * Add an element to the selected elements list.
   * Prevents duplicates based on stagewiseId.
   * @param element The element to add
   */
  public addElement(element: SelectedElement): void {
    this.uiKarton.setState((draft) => {
      if (!draft.browser.selectedElements) draft.browser.selectedElements = [];

      const elements = draft.browser.selectedElements;
      // Add if not exists
      if (!elements.some((e) => e.stagewiseId === element.stagewiseId))
        elements.push(element);
      this.syncGroupSelection(draft.browser.tabsByAgent, elements);
    });
    this.broadcastSelectionUpdate();
  }

  /**
   * Remove an element from the selected elements list by stagewiseId.
   * @param elementId The stagewiseId of the element to remove
   */
  public removeElement(elementId: string): void {
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElements = draft.browser.selectedElements.filter(
        (e) => e.stagewiseId !== elementId,
      );
      this.syncGroupSelection(
        draft.browser.tabsByAgent,
        draft.browser.selectedElements,
      );
    });
    this.broadcastSelectionUpdate();
  }

  /**
   * Clear all selected elements.
   */
  public clearElements(): void {
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElements = [];
      this.syncGroupSelection(
        draft.browser.tabsByAgent,
        draft.browser.selectedElements,
      );
    });
    this.broadcastSelectionUpdate();
  }

  /**
   * Restore selected elements directly (bulk restore).
   * @param elements The elements to restore
   */
  public restoreElements(elements: SelectedElement[]): void {
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElements = [...elements];
      this.syncGroupSelection(
        draft.browser.tabsByAgent,
        draft.browser.selectedElements,
      );
    });
    this.broadcastSelectionUpdate();
  }

  /**
   * Get the current list of selected elements.
   * @returns Array of selected elements
   */
  public getSelectedElements(): SelectedElement[] {
    return this.uiKarton.state.browser.selectedElements ?? [];
  }

  /**
   * Broadcast the current selection to all tabs to update highlights.
   * This allows elements to be highlighted on the page.
   */
  private broadcastSelectionUpdate(): void {
    const state = this.uiKarton.state;
    const allSelectedElements = state.browser.selectedElements;

    Object.values(this.tabs).forEach((tab) => {
      tab.updateContextSelection(allSelectedElements);
    });
  }

  private syncGroupSelection(
    tabsByAgent: AppState['browser']['tabsByAgent'],
    selectedElements: SelectedElement[],
  ): void {
    const group = tabsByAgent[this.getActiveBrowserGroupId()];
    if (group) {
      group.selectedElements = [...selectedElements];
    }
  }
}
