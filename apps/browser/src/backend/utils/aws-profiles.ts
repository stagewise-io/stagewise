/**
 * Helpers for reading AWS named profiles from the local ini files
 * (`~/.aws/config` and `~/.aws/credentials`).
 *
 * Runs in the Electron main process only — the ini loader performs
 * filesystem access.
 */

import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';

export interface AwsProfileInfo {
  name: string;
  /** Value of `region = ...` in the profile. */
  region?: string;
  /** Value of `sso_region = ...` in the profile (SSO-configured profiles). */
  ssoRegion?: string;
}

export interface ListAwsProfilesResult {
  profiles: AwsProfileInfo[];
  /**
   * `AWS_REGION` (preferred) or `AWS_DEFAULT_REGION` as seen by the
   * Electron main process. Useful as a hint for `default-chain` mode,
   * where the profile files have no region to read.
   *
   * Note: apps launched from Finder/Dock on macOS do not inherit shell
   * env vars, so this is often empty in GUI launches even when the
   * user has exported `AWS_REGION` in their shell config.
   */
  envRegion?: string;
  /** Truncated error message if reading the ini files failed. */
  error?: string;
}

/**
 * Merge `region` / `sso_region` from the config and credentials maps,
 * preferring whichever value exists and treating empty strings as
 * missing. Profiles in `~/.aws/config` use the prefix `profile <name>`
 * except for `default`; `loadSharedConfigFiles` strips that prefix so
 * both maps key by the raw profile name.
 */
function pickRegion(
  ...sections: Array<Record<string, string | undefined> | undefined>
): string | undefined {
  for (const s of sections) {
    const v = s?.region;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickSsoRegion(
  ...sections: Array<Record<string, string | undefined> | undefined>
): string | undefined {
  for (const s of sections) {
    const v = s?.sso_region;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Enumerate profiles declared in `~/.aws/config` and
 * `~/.aws/credentials`. Returns each profile's declared region (and
 * sso_region, if any) so callers can compute the correct Bedrock
 * cross-region inference profile prefix without a separate round-trip.
 * Names are deduplicated and sorted.
 */
export async function listAwsProfiles(): Promise<ListAwsProfilesResult> {
  const envRegion =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || undefined;
  try {
    const { configFile, credentialsFile } = await loadSharedConfigFiles();
    const names = new Set<string>([
      ...Object.keys(configFile ?? {}),
      ...Object.keys(credentialsFile ?? {}),
    ]);
    const profiles: AwsProfileInfo[] = [...names].sort().map((name) => {
      const cfg = configFile?.[name];
      const creds = credentialsFile?.[name];
      return {
        name,
        region: pickRegion(cfg, creds),
        ssoRegion: pickSsoRegion(cfg, creds),
      };
    });
    return { profiles, envRegion };
  } catch (err) {
    return {
      profiles: [],
      envRegion,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
