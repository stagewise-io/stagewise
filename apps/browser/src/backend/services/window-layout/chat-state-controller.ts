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
   * Add an element to the selected elements list for a specific message ID.
   * Prevents duplicates based on stagewiseId.
   * @param element The element to add
   * @param messageId The message ID to add the element to ('main' for main input, message ID for inline edits)
   */
  public addElement(element: SelectedElement, messageId: string): void {
    this.uiKarton.setState((draft) => {
      // Initialize array for this message ID if it doesn't exist
      if (!draft.browser.selectedElementsByMessageId[messageId])
        draft.browser.selectedElementsByMessageId[messageId] = [];

      const elements = draft.browser.selectedElementsByMessageId[messageId];
      // Add if not exists
      if (!elements.some((e) => e.stagewiseId === element.stagewiseId))
        elements.push(element);
    });
    this.broadcastSelectionUpdate(messageId);
  }

  /**
   * Remove an element from the selected elements list by stagewiseId for a specific message ID.
   * @param elementId The stagewiseId of the element to remove
   * @param messageId The message ID to remove the element from
   */
  public removeElement(elementId: string, messageId: string): void {
    this.uiKarton.setState((draft) => {
      if (draft.browser.selectedElementsByMessageId[messageId])
        draft.browser.selectedElementsByMessageId[messageId] =
          draft.browser.selectedElementsByMessageId[messageId].filter(
            (e) => e.stagewiseId !== elementId,
          );
    });
    this.broadcastSelectionUpdate(messageId);
  }

  /**
   * Clear all selected elements for a specific message ID.
   * @param messageId The message ID to clear elements for
   */
  public clearElements(messageId: string): void {
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElementsByMessageId[messageId] = [];
    });
    this.broadcastSelectionUpdate(messageId);
  }

  /**
   * Get the current list of selected elements for a specific message ID.
   * @param messageId The message ID to get elements for
   * @returns Array of selected elements for the given message ID
   */
  public getSelectedElements(messageId: string): SelectedElement[] {
    return (
      this.uiKarton.state.browser.selectedElementsByMessageId[messageId] ?? []
    );
  }

  /**
   * Broadcast the current selection to all tabs to update highlights.
   * For now, broadcasts all selected elements across all message IDs.
   * This allows elements to be highlighted on the page regardless of which message they belong to.
   * @param _messageId The message ID whose selection changed (for future optimization)
   */
  private broadcastSelectionUpdate(_messageId: string): void {
    const state = this.uiKarton.state;
    // Collect all selected elements from all message IDs
    const allSelectedElements = Object.values(
      state.browser.selectedElementsByMessageId,
    ).flat();

    Object.values(this.tabs).forEach((tab) => {
      tab.updateContextSelection(allSelectedElements);
    });
  }
}
