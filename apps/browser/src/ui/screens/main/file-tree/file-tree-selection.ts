export type FileTreeSelectionState = {
  selectedPaths: string[];
  anchorPath: string | null;
};

export type FileTreeSelectionInteraction = 'replace' | 'toggle' | 'range';

export function getContiguousRange(
  visiblePaths: string[],
  anchorPath: string | null,
  targetPath: string,
): string[] {
  const targetIndex = visiblePaths.indexOf(targetPath);
  if (targetIndex === -1) return [];

  const anchorIndex = anchorPath ? visiblePaths.indexOf(anchorPath) : -1;
  if (anchorIndex === -1) return [targetPath];

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return visiblePaths.slice(start, end + 1);
}

export function updateFileTreeSelection(
  visiblePaths: string[],
  state: FileTreeSelectionState,
  targetPath: string,
  interaction: FileTreeSelectionInteraction,
): FileTreeSelectionState {
  if (!visiblePaths.includes(targetPath)) return state;

  if (interaction === 'replace') {
    return { selectedPaths: [targetPath], anchorPath: targetPath };
  }

  if (interaction === 'toggle') {
    const selected = new Set(state.selectedPaths);
    if (selected.has(targetPath)) selected.delete(targetPath);
    else selected.add(targetPath);
    return {
      selectedPaths: visiblePaths.filter((path) => selected.has(path)),
      anchorPath: targetPath,
    };
  }

  return {
    selectedPaths: getContiguousRange(
      visiblePaths,
      state.anchorPath ?? state.selectedPaths[0] ?? targetPath,
      targetPath,
    ),
    anchorPath: state.anchorPath ?? state.selectedPaths[0] ?? targetPath,
  };
}

export function selectAllFileTreeEntries(
  visiblePaths: string[],
): FileTreeSelectionState {
  return {
    selectedPaths: visiblePaths,
    anchorPath: visiblePaths[0] ?? null,
  };
}

export function getEffectiveFileTreeActionPaths(
  selectedPaths: string[],
  targetPath: string,
): string[] {
  if (!selectedPaths.includes(targetPath)) return [targetPath];
  return pruneNestedFileTreeSelection(selectedPaths);
}

export function pruneNestedFileTreeSelection(paths: string[]): string[] {
  const sorted = Array.from(new Set(paths)).sort((a, b) => {
    const depthDelta = a.split('/').length - b.split('/').length;
    if (depthDelta !== 0) return depthDelta;
    return a.localeCompare(b);
  });
  const kept: string[] = [];

  for (const path of sorted) {
    if (kept.some((parent) => path.startsWith(`${parent}/`))) continue;
    kept.push(path);
  }

  return kept;
}
