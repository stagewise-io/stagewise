export type FileTabUnsavedEditEntry = {
  tabId: string;
  title: string;
  workspaceKey: string;
  relativePath: string;
  save: () => Promise<boolean>;
  discard: () => void;
};

const unsavedFileTabEntries = new Map<string, FileTabUnsavedEditEntry>();

export function setFileTabUnsavedEditEntry(
  entry: FileTabUnsavedEditEntry,
): void {
  unsavedFileTabEntries.set(entry.tabId, entry);
}

export function clearFileTabUnsavedEditEntry(tabId: string): void {
  unsavedFileTabEntries.delete(tabId);
}

export function getFileTabUnsavedEditEntry(
  tabId: string,
): FileTabUnsavedEditEntry | null {
  return unsavedFileTabEntries.get(tabId) ?? null;
}
