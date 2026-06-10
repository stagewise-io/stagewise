export type FileTabUnsavedEditEntry = {
  tabId: string;
  title: string;
  workspaceKey: string;
  relativePath: string;
  save: () => Promise<boolean>;
  discard: () => void;
};

type UnsavedEditsListener = () => void;

const unsavedFileTabEntries = new Map<string, FileTabUnsavedEditEntry>();
const listeners = new Set<UnsavedEditsListener>();
let version = 0;

function notifyListeners(): void {
  version++;
  listeners.forEach((listener) => listener());
}

export function getUnsavedEditsVersion(): number {
  return version;
}

export function subscribeUnsavedEdits(
  listener: UnsavedEditsListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasFileTabUnsavedEditEntry(tabId: string): boolean {
  return unsavedFileTabEntries.has(tabId);
}

export function setFileTabUnsavedEditEntry(
  entry: FileTabUnsavedEditEntry,
): void {
  unsavedFileTabEntries.set(entry.tabId, entry);
  notifyListeners();
}

export function clearFileTabUnsavedEditEntry(tabId: string): void {
  unsavedFileTabEntries.delete(tabId);
  notifyListeners();
}

export function getFileTabUnsavedEditEntry(
  tabId: string,
): FileTabUnsavedEditEntry | null {
  return unsavedFileTabEntries.get(tabId) ?? null;
}
