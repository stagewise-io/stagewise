export interface Dependency {
  name: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  suffix?: string;
}

export interface DependencyMap {
  [packageName: string]: Dependency;
}

export interface LockfileParser {
  parse(filePath: string): Promise<DependencyMap>;
  canParse(filePath: string): boolean;
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
