import { generateDeclarationFile } from './utils.js';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { resolve } from 'node:path';
import fs from 'node:fs/promises';

export default async function buildPluginSdk() {
  generateDeclarationFile(
    {
      [resolve(process.cwd(), 'src/plugin-sdk/index.tsx')]: 'index',
    },
    resolve(process.cwd(), 'tmp/plugin-sdk/unbundled-types'),
  );

  // Move the generated index.d.ts to the root if it was created in a nested directory
  const nestedIndexPath = resolve(
    process.cwd(),
    'tmp/plugin-sdk/unbundled-types/plugin-sdk/index.d.ts',
  );
  const rootIndexPath = resolve(
    process.cwd(),
    'tmp/plugin-sdk/unbundled-types/index.d.ts',
  );

  try {
    await fs.access(nestedIndexPath);
    await fs.rename(nestedIndexPath, rootIndexPath);
  } catch {
    // File is already in the correct location or doesn't exist
  }

  const extractorConfig = ExtractorConfig.loadFileAndPrepare(
    resolve(process.cwd(), 'api-extractor-configs/plugin-sdk.json'),
  );

  Extractor.invoke(extractorConfig, {});
}
