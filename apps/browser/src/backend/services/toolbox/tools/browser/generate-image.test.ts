import {
  defaultUserPreferences,
  type ProviderInstance,
} from '@shared/karton-contracts/ui/shared-types';
import type { GenerateImageToolInput } from '@shared/karton-contracts/ui/agent/tools/types';
import type { ImageGenerationOverrides } from '@stagewise/agent-core/types/agent';
import { describe, expect, it, vi } from 'vitest';
import { generateImage } from './generate-image';

function createImageProvider(kind: 'default' | 'chat'): ProviderInstance {
  const modelId = `vendor/${kind}-image`;
  return {
    id: `openrouter-${kind}`,
    name: `OpenRouter ${kind}`,
    typeId: 'openrouter',
    config: { encryptedApiKey: `encrypted-${kind}-key` },
    enabledModelIds: [],
    disabledModelIds: [],
    enabledImageModelIds: [modelId],
    discoveredModels: [],
    imageModels: [
      {
        modelId,
        displayName: `${kind === 'default' ? 'Default' : 'Chat'} image`,
        description: `${kind} image model description`,
        supportedParameters: {
          aspect_ratio: ['1:1', '3:2', '16:9'],
          quality: ['low', 'high'],
          output_format: ['png', 'jpeg', 'webp'],
          background: ['auto', 'transparent', 'opaque'],
        },
      },
    ],
  };
}

function createPreferences() {
  const preferences = structuredClone(defaultUserPreferences);
  preferences.providerInstances = [
    createImageProvider('default'),
    createImageProvider('chat'),
  ];
  preferences.agent.utilityModels.imageGeneration = {
    providerInstanceId: 'openrouter-default',
    modelId: 'vendor/default-image',
    aspectRatio: '3:2',
    quality: 'high',
  };
  return preferences;
}

function createImageTool(
  preferences: ReturnType<typeof createPreferences>,
  overrides?: ImageGenerationOverrides,
) {
  const generate = vi.fn().mockResolvedValue({
    image: { base64: 'aGVsbG8=', mediaType: 'image/png' },
  });
  const write = vi.fn().mockResolvedValue(undefined);
  const deleteAttachment = vi.fn().mockResolvedValue(undefined);
  const queueAttachments = vi.fn();
  const imageTool = generateImage(
    {
      modelProvider: { generateImage: generate },
      preferences: { get: () => preferences },
      attachments: { write, delete: deleteAttachment },
      agentStore: {
        get: () => ({
          agents: {
            instances: {
              agent: { state: { imageGenerationOverrides: overrides } },
            },
          },
        }),
      },
      queueAttachments,
    } as never,
    'agent',
  );
  const execute = (
    input: GenerateImageToolInput,
    abortSignal?: AbortSignal,
  ) => {
    if (!imageTool?.execute) throw new Error('Tool has no execute handler');
    return imageTool.execute(input, {
      toolCallId: 'call-1',
      messages: [],
      abortSignal,
    });
  };
  return {
    execute,
    generate,
    imageTool,
    queueAttachments,
    write,
    deleteAttachment,
  };
}

describe('generateImage tool', () => {
  it('enforces chat-local model and settings over defaults and tool input', async () => {
    const preferences = createPreferences();
    const { execute, generate, imageTool, queueAttachments, write } =
      createImageTool(preferences, {
        providerInstanceId: 'openrouter-chat',
        modelId: 'vendor/chat-image',
        aspectRatio: '16:9',
      });

    expect(imageTool?.description).toContain('chat image model description');
    expect(imageTool?.description).not.toContain(
      'default image model description',
    );
    expect(imageTool?.description).toContain(
      '"configuredSettings":{"aspectRatio":"16:9"}',
    );

    await execute({
      prompt: 'A small red house',
      providerInstanceId: 'openrouter-default',
      modelId: 'vendor/default-image',
      aspectRatio: '1:1',
      quality: 'low',
    });

    expect(generate).toHaveBeenCalledWith(
      'openrouter-chat',
      'vendor/chat-image',
      expect.objectContaining({
        prompt: 'A small red house',
        aspectRatio: '16:9',
        quality: 'low',
      }),
    );
    expect(write).toHaveBeenCalledOnce();
    expect(queueAttachments).toHaveBeenCalledWith(
      'agent',
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringMatching(/^att\//),
          mediaType: 'image/png',
        }),
      ]),
    );
  });

  it('applies configured default settings before tool input', async () => {
    const { execute, generate } = createImageTool(createPreferences());

    await execute({
      prompt: 'A small red house',
      providerInstanceId: 'openrouter-chat',
      modelId: 'vendor/chat-image',
      aspectRatio: '1:1',
      quality: 'low',
    });

    expect(generate).toHaveBeenCalledWith(
      'openrouter-default',
      'vendor/default-image',
      expect.objectContaining({
        aspectRatio: '3:2',
        quality: 'high',
      }),
    );
  });

  it('lets a chat override the configured default with automatic routing', async () => {
    const { execute, generate, imageTool } = createImageTool(
      createPreferences(),
      { mode: 'automatic' },
    );

    expect(imageTool?.description).toContain('default image model description');
    expect(imageTool?.description).toContain('chat image model description');
    expect(imageTool?.description).toContain('Choose the best available model');

    await execute({
      prompt: 'A small red house',
      providerInstanceId: 'openrouter-chat',
      modelId: 'vendor/chat-image',
      aspectRatio: '1:1',
      quality: 'low',
    });

    expect(generate).toHaveBeenCalledWith(
      'openrouter-chat',
      'vendor/chat-image',
      expect.objectContaining({ aspectRatio: '1:1', quality: 'low' }),
    );
  });

  it('fails closed for an unavailable chat override', async () => {
    const preferences = createPreferences();
    const { execute, generate } = createImageTool(preferences, {
      providerInstanceId: 'removed-provider',
      modelId: 'removed-model',
      aspectRatio: '16:9',
      quality: 'low',
    });

    await expect(execute({ prompt: 'A small red house' })).rejects.toThrow(
      'pinned to this chat is unavailable',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('is unavailable when no image model is enabled', () => {
    const preferences = createPreferences();
    for (const instance of preferences.providerInstances) {
      instance.enabledImageModelIds = [];
    }

    expect(createImageTool(preferences).imageTool).toBeNull();
  });

  it('uses a transparency-compatible output format', async () => {
    const { execute, generate } = createImageTool(createPreferences());

    await execute({
      prompt: 'A vector logo',
      background: 'transparent',
      outputFormat: 'jpeg',
    });

    expect(generate).toHaveBeenCalledWith(
      'openrouter-default',
      'vendor/default-image',
      expect.objectContaining({
        background: 'transparent',
        outputFormat: 'png',
      }),
    );
  });

  it('deletes an image written during cancellation', async () => {
    const controller = new AbortController();
    const { execute, write, deleteAttachment, queueAttachments } =
      createImageTool(createPreferences());
    write.mockImplementationOnce(async () => controller.abort());

    await expect(
      execute({ prompt: 'A small red house' }, controller.signal),
    ).rejects.toThrow();

    expect(deleteAttachment).toHaveBeenCalledOnce();
    expect(queueAttachments).not.toHaveBeenCalled();
  });
});
