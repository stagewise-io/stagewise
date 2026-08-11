import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAcpPrompt, MAX_INLINE_IMAGE_BYTES } from './prompt-builder';

describe('buildAcpPrompt', () => {
  it('uses compressed history instead of replaying older raw messages', async () => {
    const currentMessage = {
      id: 'current-user',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Current request' }],
    };
    const history = [
      {
        id: 'old-user',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Old raw request' }],
      },
      {
        id: 'boundary-user',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Recent request' }],
        metadata: {
          createdAt: new Date(),
          partsMetadata: [undefined],
          compressedHistory: 'Condensed earlier conversation',
        },
      },
      currentMessage,
    ];
    const prompt = await buildAcpPrompt([currentMessage], new Map(), history);
    const promptText = prompt
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');
    expect(promptText).toContain('Condensed earlier conversation');
    expect(promptText).toContain('Recent request');
    expect(promptText).toContain('Current request');
    expect(promptText).not.toContain('Old raw request');
  });

  it('sends binary attachments as resource links instead of UTF-8 text', async () => {
    const root = await mkdtemp(nodePath.join(tmpdir(), 'stagewise-acp-'));
    try {
      await writeFile(nodePath.join(root, 'sample.bin'), Buffer.from([0, 255]));
      const message = {
        id: 'user-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Inspect this file' }],
        metadata: {
          createdAt: new Date(),
          partsMetadata: [undefined],
          attachments: [{ path: 'workspace/sample.bin' }],
        },
      };

      const prompt = await buildAcpPrompt(
        [message],
        new Map([['workspace', root]]),
        [],
      );

      expect(prompt).toContainEqual({
        type: 'resource_link',
        name: 'sample.bin',
        uri: expect.stringMatching(/^file:/),
        size: 2,
      });
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it('does not inline oversized images', async () => {
    const root = await mkdtemp(nodePath.join(tmpdir(), 'stagewise-acp-'));
    try {
      const path = nodePath.join(root, 'large.png');
      await writeFile(path, '');
      await truncate(path, MAX_INLINE_IMAGE_BYTES + 1);
      const prompt = await buildAcpPrompt(
        [
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Inspect this image' }],
            metadata: {
              createdAt: new Date(),
              partsMetadata: [undefined],
              attachments: [{ path: 'workspace/large.png' }],
            },
          },
        ],
        new Map([['workspace', root]]),
        [],
        { image: true },
      );

      expect(prompt).toContainEqual(
        expect.objectContaining({
          type: 'resource_link',
          size: MAX_INLINE_IMAGE_BYTES + 1,
        }),
      );
      expect(prompt).not.toContainEqual(
        expect.objectContaining({ type: 'image' }),
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
