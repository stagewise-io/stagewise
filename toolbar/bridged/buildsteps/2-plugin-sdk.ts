import { generateDeclarationFile } from './utils.js';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { resolve } from 'node:path';

export default async function buildPluginSdk() {
  generateDeclarationFile(
    {
      [resolve(process.cwd(), 'src/plugin-sdk/index.tsx')]: 'index',
    },
    resolve(process.cwd(), 'tmp/plugin-sdk/unbundled-types'),
  );

  const extractorConfig = ExtractorConfig.loadFileAndPrepare(
    resolve(process.cwd(), 'api-extractor-configs/plugin-sdk.json'),
  );

  Extractor.invoke(extractorConfig, {});
}
