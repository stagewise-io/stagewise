import axios from 'axios';
import { compareVersions as compareVersionsUtil } from './lock-file-parsers/version-comparator';

export class RegistryService {
  private static instance: RegistryService;

  private constructor() {}

  public static getInstance() {
    if (!RegistryService.instance) {
      RegistryService.instance = new RegistryService();
    }
    return RegistryService.instance;
  }

  public async getLatestToolbarVersion(): Promise<string | null> {
    try {
      const response = await axios.get(
        'https://registry.npmjs.org/@stagewise/toolbar/latest',
        { timeout: 5000 },
      );
      return response.data.version;
    } catch (error) {
      console.error('Failed to fetch latest toolbar version:', error);
      return null;
    }
  }

  public async getLatestExtensionVersion(): Promise<string | null> {
    try {
      const versions = await Promise.allSettled([
        this.fetchFromVSCodeMarketplace(),
        this.fetchFromOpenVSX(),
      ]);

      const validVersions = versions
        .filter(
          (result): result is PromiseFulfilledResult<string> =>
            result.status === 'fulfilled' &&
            result.value !== null &&
            result.value !== undefined &&
            typeof result.value === 'string',
        )
        .map((result) => result.value);

      if (validVersions.length === 0) {
        return null;
      }

      return validVersions.reduce((newest, current) => {
        return this.compareVersions(current, newest) > 0 ? current : newest;
      }, validVersions[0]);
    } catch (error) {
      console.error('Failed to fetch latest extension version:', error);
      return null;
    }
  }

  private async fetchFromVSCodeMarketplace(): Promise<string | null> {
    try {
      const response = await axios.post(
        'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=3.0-preview.1',
        {
          filters: [
            {
              criteria: [
                {
                  filterType: 7, // ExtensionName
                  value: 'stagewise.stagewise-vscode-extension',
                },
              ],
              pageSize: 1,
              pageNumber: 1,
            },
          ],
          flags: 0x200, // IncludeVersions flag
        },
        {
          timeout: 5000,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );

      const extensions = response.data?.results?.[0]?.extensions;
      if (extensions && extensions.length > 0) {
        const versions = extensions[0].versions;
        if (versions && versions.length > 0) {
          const newest = versions.reduce(
            (a: { version: string }, b: { version: string }) =>
              this.compareVersions(a.version, b.version) > 0 ? a : b,
          ).version;
          return newest;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch from VS Code Marketplace:', error);
      return null;
    }
  }

  private async fetchFromOpenVSX(): Promise<string | null> {
    try {
      const response = await axios.get(
        'https://open-vsx.org/api/stagewise/stagewise-vscode-extension/latest',
        {
          timeout: 5000,
          headers: {
            Accept: 'application/json',
          },
        },
      );
      return response.data?.version || null;
    } catch (error) {
      console.error('Failed to fetch from Open VSX Registry:', error);
      return null;
    }
  }

  private compareVersions(v1: string, v2: string): number {
    return compareVersionsUtil(v1, v2);
  }
}
