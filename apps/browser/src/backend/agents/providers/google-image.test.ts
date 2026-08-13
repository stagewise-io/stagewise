import { describe, expect, it, vi } from 'vitest';

const { generateImage } = vi.hoisted(() => ({ generateImage: vi.fn() }));

vi.mock('ai', () => ({ generateImage }));

import { generateGoogleImage } from './google-image';

describe('Google image generation', () => {
  it('passes Gemini aspect ratio and resolution through the AI SDK', async () => {
    generateImage.mockResolvedValue({
      images: [{ base64: 'image-data', mediaType: 'image/png' }],
    });

    const result = await generateGoogleImage(
      'test-key',
      'https://generativelanguage.googleapis.com/v1beta',
      'gemini-3.1-flash-image',
      {
        prompt: 'A small cabin in the woods',
        aspectRatio: '16:9',
        resolution: '4K',
      },
    );

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '16:9',
        providerOptions: {
          google: {
            imageConfig: { aspectRatio: '16:9', imageSize: '4K' },
          },
        },
      }),
    );
    expect(result).toEqual({
      images: [{ base64: 'image-data', mediaType: 'image/png' }],
    });
  });
});
