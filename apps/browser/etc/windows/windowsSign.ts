import type { SignToolOptions } from '@electron/windows-sign/dist/cjs/types';
import type { WindowsSignOptions } from '@electron/packager';

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
export function getWindowsSignConfig():
  | (WindowsSignOptions & SignToolOptions)
  | undefined {
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

  const dlibPath = process.env.AZURE_CODE_SIGNING_DLIB!;
  const metadataPath = process.env.AZURE_METADATA_JSON!;
  const signtoolPath = process.env.SIGNTOOL_PATH!;

  // Build sign params for Azure Trusted Signing DLIB
  const signParams = `/dlib ${dlibPath} /dmdf ${metadataPath}`;

  return {
    signToolPath: signtoolPath,
    signWithParams: signParams,
    timestampServer: 'http://timestamp.acs.microsoft.com',
    // @ts-expect-error - the types don't properly overlap for some reason...
    hashes: ['sha256'],
    website: 'https://ade.stagewise.io',
    // CRITICAL: Disable automatic certificate selection (/a flag)
    // The /a flag causes signtool to look in the Windows certificate store,
    // which conflicts with the DLIB approach where the certificate comes from Azure
    automaticallySelectCertificate: false,
  };
}
