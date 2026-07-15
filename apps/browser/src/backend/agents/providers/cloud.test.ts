import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.hoisted(() => vi.fn());
const homedir = vi.hoisted(() => vi.fn(() => '/home/tester'));
const createAmazonBedrock = vi.hoisted(() =>
  vi.fn(() => vi.fn(() => ({ provider: 'bedrock' }))),
);

vi.mock('node:fs', () => ({ readFileSync }));
vi.mock('node:os', () => ({ homedir }));
vi.mock('@ai-sdk/amazon-bedrock', () => ({ createAmazonBedrock }));

import { bedrockProviderType, resolveProfileRegion } from './cloud';

describe('resolveProfileRegion', () => {
  let originalAwsConfigFile: string | undefined;

  beforeEach(() => {
    originalAwsConfigFile = process.env.AWS_CONFIG_FILE;
    readFileSync.mockReset();
    homedir.mockClear();
    createAmazonBedrock.mockClear();
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
      '/home/tester/.aws/config',
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
});
