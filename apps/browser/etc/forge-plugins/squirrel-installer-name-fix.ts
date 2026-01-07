import { PluginBase } from '@electron-forge/plugin-base';
import type {
  ForgeHookFn,
  ForgeConfig,
  ForgeMakeResult,
} from '@electron-forge/shared-types';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Configuration options for the Squirrel installer name fix plugin.
 */
export interface SquirrelInstallerNameFixPluginOptions {
  /** Base name for the application (used in nupkg filename) */
  appBaseName: string;
  /** Version string (used in nupkg filename) */
  version: string;
}

/**
 * Forge plugin that fixes Squirrel.Windows installer naming.
 *
 * This plugin processes the squirrel.windows output folder after make:
 * - Finds all architecture subdirectories (e.g., x64, arm64, ia32)
 * - Renames nupkg files to include architecture: `${appBaseName}-${version}-${arch}-full.nupkg`
 * - Renames RELEASES files to be arch-specific: `RELEASES-win32-${arch}`
 * - Updates nupkg references inside RELEASES files
 * - Moves all files to the parent squirrel.windows folder
 * - Cleans up empty architecture directories
 *
 * @example
 * ```typescript
 * new SquirrelInstallerNameFixPlugin({ appBaseName: 'myapp', version: '1.0.0' })
 * ```
 */
export class SquirrelInstallerNameFixPlugin extends PluginBase<SquirrelInstallerNameFixPluginOptions> {
  name = 'squirrel-installer-name-fix';

  getHooks(): {
    postMake: ForgeHookFn<'postMake'>;
  } {
    const { appBaseName, version } = this.config;

    return {
      postMake: async (
        forgeConfig: ForgeConfig,
        makeResults: ForgeMakeResult[],
      ): Promise<ForgeMakeResult[]> => {
        const outputPath = path.join(
          forgeConfig.outDir ?? 'out',
          typeof forgeConfig.buildIdentifier === 'function'
            ? forgeConfig.buildIdentifier()
            : (forgeConfig.buildIdentifier ?? ''),
          'make',
          'squirrel.windows',
        );

        // Check if squirrel.windows directory exists
        if (!fs.existsSync(outputPath)) {
          console.log(
            '[squirrel-installer-name-fix] No squirrel.windows output found, skipping',
          );
          return makeResults;
        }

        // Get all architecture subdirectories
        const entries = fs.readdirSync(outputPath, { withFileTypes: true });
        const archDirs = entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

        if (archDirs.length === 0) {
          console.log(
            '[squirrel-installer-name-fix] No architecture directories found, skipping',
          );
          return makeResults;
        }

        console.log(
          `[squirrel-installer-name-fix] Found architectures: ${archDirs.join(', ')}`,
        );

        // Track file path mappings: old path -> new path
        const pathMappings = new Map<string, string>();

        // Process each architecture directory
        // Order: First rename unique files (nupkg, RELEASES), then move other files
        for (const arch of archDirs) {
          const archPath = path.join(outputPath, arch);
          const files = fs.readdirSync(archPath);

          console.log(
            `[squirrel-installer-name-fix] Processing ${arch}: ${files.join(', ')}`,
          );

          // Find the original nupkg filename for updating RELEASES
          const nupkgFile = files.find((f) => f.endsWith('-full.nupkg'));
          const newNupkgName = `${appBaseName}-${version}-${arch}-full.nupkg`;

          // Step 1: Rename and move nupkg file first (gets unique arch-specific name)
          if (nupkgFile) {
            const srcPath = path.join(archPath, nupkgFile);
            const destPath = path.join(outputPath, newNupkgName);
            fs.renameSync(srcPath, destPath);
            pathMappings.set(srcPath, destPath);
            console.log(
              `[squirrel-installer-name-fix] Renamed ${nupkgFile} -> ${newNupkgName}`,
            );
          }

          // Step 2: Update and move RELEASES file (gets unique arch-specific name)
          const releasesFile = files.find((f) => f === 'RELEASES');
          if (releasesFile) {
            const srcPath = path.join(archPath, releasesFile);
            const newReleasesName = `RELEASES-win32-${arch}`;
            const destPath = path.join(outputPath, newReleasesName);

            // Read and search/replace the original nupkg filename with the new one
            // RELEASES format: "SHA1 filename size" - we only replace the filename portion
            let content = fs.readFileSync(srcPath, 'utf-8');
            if (nupkgFile) {
              content = content.replaceAll(nupkgFile, newNupkgName);
            }

            // Write to new location and remove original
            fs.writeFileSync(destPath, content);
            fs.unlinkSync(srcPath);
            pathMappings.set(srcPath, destPath);
            console.log(
              `[squirrel-installer-name-fix] Renamed RELEASES -> ${newReleasesName} (updated nupkg reference)`,
            );
          }

          // Step 3: Move remaining files (after unique files are safely renamed)
          const remainingFiles = fs.readdirSync(archPath);
          for (const file of remainingFiles) {
            const srcPath = path.join(archPath, file);
            const destPath = path.join(outputPath, file);

            if (fs.existsSync(destPath)) {
              console.log(
                `[squirrel-installer-name-fix] Skipping ${file} (already exists in output)`,
              );
            } else {
              fs.renameSync(srcPath, destPath);
              pathMappings.set(srcPath, destPath);
              console.log(`[squirrel-installer-name-fix] Moved ${file}`);
            }
          }

          // Remove the now-empty architecture directory
          try {
            fs.rmdirSync(archPath);
            console.log(
              `[squirrel-installer-name-fix] Removed empty directory: ${arch}`,
            );
          } catch (err) {
            console.log(
              `[squirrel-installer-name-fix] Could not remove directory ${arch}: ${err}`,
            );
          }
        }

        // Update makeResults to reflect the new file paths
        for (const result of makeResults) {
          if (result.artifacts) {
            result.artifacts = result.artifacts.map((artifactPath) => {
              const newPath = pathMappings.get(artifactPath);
              if (newPath) {
                console.log(
                  `[squirrel-installer-name-fix] Updated artifact path: ${artifactPath} -> ${newPath}`,
                );
                return newPath;
              }
              return artifactPath;
            });
          }
        }

        console.log(
          '[squirrel-installer-name-fix] Done processing squirrel.windows output',
        );
        return makeResults;
      },
    };
  }
}
