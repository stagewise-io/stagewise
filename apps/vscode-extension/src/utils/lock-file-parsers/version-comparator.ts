// Compares two version strings. Returns 1 if v1 > v2, 0 if equal, -1 if v1 < v2
export function compareVersions(v1: string, v2: string): number {
  // Helper to split version into [main, suffix]
  function splitSuffix(version: string): [string, string | null] {
    const match = version.match(/^(\d+(?:\.\d+)*)(.*)$/);
    if (!match) return [version, null];
    return [match[1], match[2] || null];
  }

  // Helper to parse version into [major, minor, patch, build]
  function parseMain(main: string): number[] {
    return main.split('.').map((x) => Number.parseInt(x, 10));
  }

  // Compare arrays of numbers
  function compareParts(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const na = a[i] ?? 0;
      const nb = b[i] ?? 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  // Compare suffixes simply: lexicographically, but empty > non-empty
  function compareSuffix(a: string | null, b: string | null): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  }

  const [main1, suffix1] = splitSuffix(v1);
  const [main2, suffix2] = splitSuffix(v2);
  const parts1 = parseMain(main1);
  const parts2 = parseMain(main2);

  const cmp = compareParts(parts1, parts2);
  if (cmp !== 0) return cmp;
  return compareSuffix(suffix1, suffix2);
}
