import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookup = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
);
vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}));
const httpsGet = vi.hoisted(() => vi.fn());
vi.mock('node:https', () => ({ get: httpsGet }));
import {
  generateAlibabaImage,
  generateMiniMaxImage,
  generateZAiImage,
  getAlibabaImageModels,
} from './native-image';

afterEach(() => {
  vi.unstubAllGlobals();
  dnsLookup.mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
});

beforeEach(() => {
  httpsGet.mockReset().mockImplementation((_url, _options, onResponse) => {
    const request = new EventEmitter();
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      resume: vi.fn(),
      destroy: vi.fn(),
    });
    queueMicrotask(() => {
      onResponse(response);
      response.emit('data', Buffer.from('image-bytes'));
      response.emit('end');
    });
    return request;
  });
});

function alibabaImageResponse() {
  return new Response(
    JSON.stringify({
      output: {
        choices: [{ message: { content: [{ image: 'https://image.test' }] } }],
      },
    }),
  );
}

describe('native image APIs', () => {
  it('calls Z.ai with its model-specific size', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: 'https://image.test' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateZAiImage(
      'secret',
      'https://api.z.ai/api/paas/v4',
      'glm-image',
      { prompt: 'A lighthouse', aspectRatio: '16:9', quality: 'hd' },
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toMatchObject({
      model: 'glm-image',
      size: '1728x960',
      quality: 'hd',
    });
    expect(result.image.mediaType).toBe('image/png');
    const pinnedLookup = httpsGet.mock.calls[0]?.[1]?.lookup;
    const callback = vi.fn();
    pinnedLookup('image.test', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  });

  it('rejects provider image URLs that resolve to private addresses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ url: 'https://private.example/image' }],
          }),
        ),
      ),
    );
    dnsLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

    await expect(
      generateZAiImage('secret', 'https://api.z.ai/api/paas/v4', 'glm-image', {
        prompt: 'A lighthouse',
      }),
    ).rejects.toThrow('public host');
  });

  it('calls MiniMax and downloads its expiring image URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { image_urls: ['https://image.test'] } }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await generateMiniMaxImage(
      'secret',
      'https://api.minimax.io/v1',
      'image-01',
      { prompt: 'A lighthouse', aspectRatio: '3:2', seed: 42 },
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toMatchObject({
      model: 'image-01',
      aspect_ratio: '3:2',
      response_format: 'url',
      seed: 42,
    });
  });

  it('uses Alibaba native image endpoints instead of its chat endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(alibabaImageResponse());
    vi.stubGlobal('fetch', fetchMock);

    await generateAlibabaImage(
      'secret',
      'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1',
      'qwen-image-3.0-pro',
      { prompt: 'A lighthouse', aspectRatio: '4:3', resolution: '2K' },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toMatchObject({
      model: 'qwen-image-3.0-pro',
      parameters: { size: '2368*1728' },
    });
    expect(
      getAlibabaImageModels(
        'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1',
      ).map(({ modelId }) => modelId),
    ).toContain('qwen-image-3.0-pro');
    expect(
      getAlibabaImageModels('https://dashscope-us.aliyuncs.com/api/v1').map(
        ({ modelId }) => modelId,
      ),
    ).not.toContain('qwen-image-3.0-pro');
    expect(
      getAlibabaImageModels(
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      ),
    ).not.toHaveLength(0);
  });

  it('keeps Wan 2.7 Pro 4K dimensions within its API limit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(alibabaImageResponse());
    vi.stubGlobal('fetch', fetchMock);

    await generateAlibabaImage(
      'secret',
      'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1',
      'wan2.7-image-pro',
      { prompt: 'A lighthouse', aspectRatio: '16:9', resolution: '4K' },
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toMatchObject({
      parameters: { size: '4096*2304' },
    });
  });

  it('uses Wan 2.6 T2I recommended dimensions', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(alibabaImageResponse());
    vi.stubGlobal('fetch', fetchMock);

    await generateAlibabaImage(
      'secret',
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      'wan2.6-t2i',
      { prompt: 'A lighthouse', aspectRatio: '16:9' },
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toMatchObject({
      parameters: { size: '1696*960' },
    });
  });
});
