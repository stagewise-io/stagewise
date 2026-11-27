import { describe, expect, it } from 'vitest';
import { getDraftAttachments } from './tiptap-content-utils';

describe('getDraftAttachments', () => {
  it('restores files and element blobs after a composer remount', () => {
    const draft = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'attachment',
              attrs: { id: 'att/file.png', label: 'image.png' },
            },
            {
              type: 'elementAttachment',
              attrs: {
                id: 'dom-1',
                blobPath: 'att/element.swdomelement',
                label: 'div',
              },
            },
            {
              type: 'attachment',
              attrs: { id: 'att/file.png', label: 'image.png' },
            },
          ],
        },
      ],
    };
    expect(getDraftAttachments(JSON.parse(JSON.stringify(draft)))).toEqual([
      { path: 'att/file.png', originalFileName: 'image.png' },
      { path: 'att/element.swdomelement', originalFileName: 'div' },
    ]);
  });

  it('preserves live metadata and excludes removed or pending nodes', () => {
    expect(
      getDraftAttachments(
        {
          type: 'doc',
          content: [
            { type: 'attachment', attrs: { id: 'w1/file.txt', label: 'file' } },
            { type: 'elementAttachment', attrs: { id: 'pending' } },
          ],
        },
        [
          { path: 'w1/file.txt', originalFileName: 'original.txt' },
          { path: 'att/removed' },
        ],
      ),
    ).toEqual([{ path: 'w1/file.txt', originalFileName: 'original.txt' }]);
  });
});
