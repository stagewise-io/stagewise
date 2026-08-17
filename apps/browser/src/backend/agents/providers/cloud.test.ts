import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.hoisted(() => vi.fn());
const homedir = vi.hoisted(() => vi.fn(() => '/home/tester'));
const createAmazonBedrock = vi.hoisted(() =>
  vi.fn(() => vi.fn(() => ({ provider: 'bedrock' }))),
);
const azureImageModel = vi.hoisted(() => ({ provider: 'azure' }));
const createAzure = vi.hoisted(() =>
  vi.fn(() => Object.assign(vi.fn(), { image: vi.fn(() => azureImageModel) })),
);
const vertexImageModel = vi.hoisted(() => ({ provider: 'vertex' }));
const createVertex = vi.hoisted(() =>
  vi.fn(() => Object.assign(vi.fn(), { image: vi.fn(() => vertexImageModel) })),
);
const generateImage = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ image: { base64: '', mediaType: 'image/png' } }),
);

vi.mock('node:fs', () => ({ readFileSync }));
vi.mock('node:os', () => ({ homedir }));
vi.mock('@ai-sdk/amazon-bedrock', () => ({ createAmazonBedrock }));
vi.mock('@ai-sdk/azure', () => ({ createAzure }));
vi.mock('@ai-sdk/google-vertex', () => ({ createVertex }));
vi.mock('ai', () => ({ generateImage }));

import {
  azureProviderType,
  bedrockProviderType,
  resolveProfileRegion,
  vertexProviderType,
} from './cloud';

describe('cloud providers', () => {
  let originalAwsConfigFile: string | undefined;

  beforeEach(() => {
    originalAwsConfigFile = process.env.AWS_CONFIG_FILE;
    readFileSync.mockReset();
    homedir.mockClear();
    createAmazonBedrock.mockClear();
    createAzure.mockClear();
    createVertex.mockClear();
    generateImage.mockClear();
    delete process.env.AWS_CONFIG_FILE;
  });

  afterEach(() => {
    if (originalAwsConfigFile === undefined) {
      delete process.env.AWS_CONFIG_FILE;
    } else {
      process.env.AWS_CONFIG_FILE = originalAwsConfigFile;
    }
  });

  it('reads a named profile from AWS_CONFIG_FILE', () => {
    process.env.AWS_CONFIG_FILE = ' /configured/aws/config ';
    readFileSync.mockReturnValue(
      '[default]\nregion = us-east-1\n[profile production]\nregion = eu-west-1\n',
    );

    expect(resolveProfileRegion('production')).toBe('eu-west-1');
    expect(readFileSync).toHaveBeenCalledWith('/configured/aws/config', 'utf8');
  });

  it('uses the shared config path under the home directory by default', () => {
    readFileSync.mockReturnValue(
      '[profile staging]\nregion = ap-southeast-2\n',
    );

    expect(resolveProfileRegion('staging')).toBe('ap-southeast-2');
    expect(readFileSync).toHaveBeenCalledWith(
      join('/home/tester', '.aws', 'config'),
      'utf8',
    );
  });

  it('reads the default profile section without a profile prefix', () => {
    readFileSync.mockReturnValue('[default]\nregion = us-west-2\n');

    expect(resolveProfileRegion('default')).toBe('us-west-2');
  });

  it('returns undefined for an absent profile section', () => {
    readFileSync.mockReturnValue('[profile other]\nregion = us-east-2\n');

    expect(resolveProfileRegion('missing')).toBeUndefined();
  });

  it('prefers an explicitly configured region over the profile region', () => {
    bedrockProviderType.createLanguageModel({
      modelId: 'anthropic.claude-3-5-sonnet',
      apiKey: '',
      baseURL: '',
      config: {
        awsAuthMode: 'profile',
        awsProfileName: 'production',
        region: ' eu-central-1 ',
      },
      decryptedConfig: {},
    });

    expect(createAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'eu-central-1' }),
    );
  });

  it('forwards Vertex image resolution with the aspect ratio', async () => {
    await vertexProviderType.generateImage?.({
      modelId: 'gemini-3.1-flash-image',
      apiKey: '',
      config: {},
      decryptedConfig: {},
      request: {
        prompt: 'A landscape',
        aspectRatio: '16:9',
        resolution: '4K',
      },
    });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: vertexImageModel,
        aspectRatio: '16:9',
        providerOptions: {
          vertex: {
            imageConfig: { aspectRatio: '16:9', imageSize: '4K' },
          },
        },
      }),
    );
    expect(createVertex).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'global' }),
    );
  });

  it('keeps the existing Vertex language default location', () => {
    vertexProviderType.createLanguageModel({
      modelId: 'gemini-2.5-pro',
      apiKey: '',
      config: {},
      decryptedConfig: {},
    });

    expect(createVertex).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'us-central1' }),
    );
  });

  it('only exposes region-compatible Vertex image models', async () => {
    const models = await vertexProviderType.getInitialImageModels?.(
      { location: 'us-central1' },
      {},
    );
    const unsupportedModels = await vertexProviderType.getInitialImageModels?.(
      { location: 'asia-northeast1' },
      {},
    );

    expect(models?.map(({ modelId }) => modelId)).toEqual([
      'gemini-2.5-flash-image',
    ]);
    expect(unsupportedModels).toEqual([]);
  });

  it('uses Azure image API defaults and supported output formats', async () => {
    const models = await azureProviderType.getInitialImageModels?.(
      { baseUrl: '' },
      {},
    );
    expect(
      models?.find(({ modelId }) => modelId === 'gpt-image-1.5'),
    ).toBeDefined();
    expect(
      models?.find(({ modelId }) => modelId === 'gpt-image-2')
        ?.supportedParameters.output_format,
    ).toEqual(['png', 'jpeg']);

    await azureProviderType.generateImage?.({
      modelId: 'gpt-image-1.5',
      apiKey: 'secret',
      baseURL: 'https://example.openai.azure.com/openai',
      config: { baseUrl: '' },
      decryptedConfig: {},
      request: { prompt: 'A landscape' },
    });

    expect(createAzure).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: 'preview' }),
    );
  });
});
