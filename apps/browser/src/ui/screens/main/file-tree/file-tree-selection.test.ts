import { describe, expect, it } from 'vitest';
import {
  getContiguousRange,
  getEffectiveFileTreeActionPaths,
  pruneNestedFileTreeSelection,
  selectAllFileTreeEntries,
  updateFileTreeSelection,
  type FileTreeSelectionState,
} from './file-tree-selection';

const visiblePaths = [
  'README.md',
  'src',
  'src/app.tsx',
  'src/index.ts',
  'package.json',
];

const emptyState: FileTreeSelectionState = {
  selectedPaths: [],
  anchorPath: null,
};

describe('file tree selection model', () => {
  it('replaces selection and moves the anchor for plain selection', () => {
    const result = updateFileTreeSelection(
      visiblePaths,
      {
        selectedPaths: ['README.md', 'src'],
        anchorPath: 'README.md',
      },
      'package.json',
      'replace',
    );

    expect(result).toEqual({
      selectedPaths: ['package.json'],
      anchorPath: 'package.json',
    });
  });

  it('toggles a path while preserving visible order', () => {
    const selected = updateFileTreeSelection(
      visiblePaths,
      { selectedPaths: ['package.json'], anchorPath: 'package.json' },
      'src',
      'toggle',
    );

    expect(selected).toEqual({
      selectedPaths: ['src', 'package.json'],
      anchorPath: 'src',
    });

    const removed = updateFileTreeSelection(
      visiblePaths,
      selected,
      'src',
      'toggle',
    );

    expect(removed).toEqual({
      selectedPaths: ['package.json'],
      anchorPath: 'src',
    });
  });

  it('selects a contiguous range from the anchor to the target', () => {
    expect(getContiguousRange(visiblePaths, 'src', 'package.json')).toEqual([
      'src',
      'src/app.tsx',
      'src/index.ts',
      'package.json',
    ]);

    const result = updateFileTreeSelection(
      visiblePaths,
      { selectedPaths: ['src'], anchorPath: 'src' },
      'package.json',
      'range',
    );

    expect(result.selectedPaths).toEqual([
      'src',
      'src/app.tsx',
      'src/index.ts',
      'package.json',
    ]);
    expect(result.anchorPath).toBe('src');
  });

  it('uses the target as range anchor when no anchor exists', () => {
    const result = updateFileTreeSelection(
      visiblePaths,
      emptyState,
      'src/index.ts',
      'range',
    );

    expect(result).toEqual({
      selectedPaths: ['src/index.ts'],
      anchorPath: 'src/index.ts',
    });
  });

  it('selects all visible entries', () => {
    expect(selectAllFileTreeEntries(visiblePaths)).toEqual({
      selectedPaths: visiblePaths,
      anchorPath: 'README.md',
    });
  });

  it('uses the clicked item for actions when it is outside the selection', () => {
    expect(
      getEffectiveFileTreeActionPaths(['README.md', 'src'], 'package.json'),
    ).toEqual(['package.json']);
  });

  it('uses the selected set for actions when the target is selected', () => {
    expect(
      getEffectiveFileTreeActionPaths(['README.md', 'src'], 'src'),
    ).toEqual(['README.md', 'src']);
  });

  it('prunes descendants when a selected folder already contains them', () => {
    expect(
      pruneNestedFileTreeSelection([
        'src/app.tsx',
        'README.md',
        'src',
        'src/nested/file.ts',
      ]),
    ).toEqual(['README.md', 'src']);
  });
});
