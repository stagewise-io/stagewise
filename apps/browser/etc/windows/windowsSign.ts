import type { WindowsSignOptions } from '@electron/packager';
import type { HASHES } from '@electron/windows-sign/dist/esm/types';

/**
 * Windows code signing configuration for Azure Trusted Signing.
 *
 * This configuration is used by both @electron/packager (via packagerConfig.windowsSign)
 * and @electron-forge/maker-squirrel (via windowsSign option) to sign Windows executables.
 *
 * Required environment variables (set in CI):
 * - SIGNTOOL_PATH: Path to signtool.exe (Windows SDK)
 * - AZURE_CODE_SIGNING_DLIB: Path to Azure.CodeSigning.Dlib.dll
 * - AZURE_METADATA_JSON: Path to metadata.json with Azure Trusted Signing config
 * - AZURE_TENANT_ID: Azure AD tenant ID
 * - AZURE_CLIENT_ID: Azure AD application (client) ID
 * - AZURE_CLIENT_SECRET: Azure AD client secret
 *
 * @see https://www.electronforge.io/guides/code-signing/code-signing-windows
 */
export function getWindowsSignConfig(): WindowsSignOptions | undefined {
  // Only enable signing when all required environment variables are set
  const hasSigningConfig =
    process.env.SIGNTOOL_PATH &&
    process.env.AZURE_CODE_SIGNING_DLIB &&
    process.env.AZURE_METADATA_JSON;

  if (!hasSigningConfig) {
    console.log(
      '[windowsSign] Skipping Windows code signing - required environment variables not set',
    );
    return undefined;
  }

  console.log('[windowsSign] Windows code signing enabled');
  console.log(`[windowsSign] signtool.exe: ${process.env.SIGNTOOL_PATH}`);
  console.log(
    `[windowsSign] Azure DLIB: ${process.env.AZURE_CODE_SIGNING_DLIB}`,
  );
  console.log(
    `[windowsSign] metadata.json: ${process.env.AZURE_METADATA_JSON}`,
  );

  return {
    signToolPath: process.env.SIGNTOOL_PATH,
    // Use Azure Trusted Signing via the dlib parameter
    // /v = verbose, /debug = debug output, /fd = file digest algorithm
    // /dlib = path to signing DLL, /dmdf = path to metadata JSON
    signWithParams: `/v /debug /fd SHA256 /dlib "${process.env.AZURE_CODE_SIGNING_DLIB}" /dmdf "${process.env.AZURE_METADATA_JSON}"`,
    timestampServer: 'http://timestamp.acs.microsoft.com',
    hashes: ['sha256' as HASHES],
  };
}
