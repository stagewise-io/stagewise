import type { KartonService } from '../karton';
import type { TabController } from './tab-controller';
import type { SelectedElement } from '@shared/selected-elements';

export class ChatStateController {
  private uiKarton: KartonService;
  private tabs: Record<string, TabController>;

  constructor(uiKarton: KartonService, tabs: Record<string, TabController>) {
    this.uiKarton = uiKarton;
    this.tabs = tabs;
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
   */
  public addElement(element: SelectedElement): void {
    this.uiKarton.setState((draft) => {
      // Add if not exists
      if (
        !draft.browser.selectedElements.some(
          (e) => e.stagewiseId === element.stagewiseId,
        )
      ) {
        draft.browser.selectedElements.push(element);
      }
    });
    this.broadcastSelectionUpdate();
  }

  /**
   * Remove an element from the selected elements list by stagewiseId.
   */
  public removeElement(elementId: string): void {
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElements = draft.browser.selectedElements.filter(
        (e) => e.stagewiseId !== elementId,
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
    });
    this.broadcastSelectionUpdate();
  }

  /**
   * Get the current list of selected elements.
   */
  public getSelectedElements(): SelectedElement[] {
    return this.uiKarton.state.browser.selectedElements;
  }

  /**
   * Broadcast the current selection to all tabs to update highlights.
   */
  private broadcastSelectionUpdate(): void {
    const state = this.uiKarton.state;
    const selectedElements = state.browser.selectedElements;
    Object.values(this.tabs).forEach((tab) => {
      tab.updateContextSelection(selectedElements);
    });
  }
}
