import { describe, it } from 'vitest';
import assert from 'node:assert';
import { compareVersions } from '../utils/lock-file-parsers/version-comparator';

describe('compareVersions', () => {
  const cases: Array<[string, string, number, string]> = [
    // [v1, v2, expected, description]
    ['1.0.0', '1.0.0', 0, 'equal versions'],
    ['1.0.1', '1.0.0', 1, 'patch greater'],
    ['1.2.0', '1.1.9', 1, 'minor greater'],
    ['2.0.0', '1.9.9', 1, 'major greater'],
    ['1.0.0', '1.0.1', -1, 'patch less'],
    ['1.1.0', '1.2.0', -1, 'minor less'],
    ['1.0.0', '2.0.0', -1, 'major less'],
    ['1.0', '1.0.0', 0, 'missing patch treated as zero'],
    ['1', '1.0.0', 0, 'missing minor and patch treated as zero'],
    ['1.0.0.1', '1.0.0', 1, 'build greater'],
    ['1.0.0', '1.0.0.1', -1, 'build less'],
    ['1.0.0-alpha', '1.0.0', -1, 'suffix less than no suffix'],
    ['1.0.0', '1.0.0-alpha', 1, 'no suffix greater than suffix'],
    ['1.0.0-alpha', '1.0.0-beta', -1, 'suffix lexicographical'],
    ['1.0.0-beta', '1.0.0-alpha', 1, 'suffix lexicographical reverse'],
    ['1.0.0-alpha.1', '1.0.0-alpha.2', -1, 'suffix with number'],
    ['1.0.0-alpha.2', '1.0.0-alpha.1', 1, 'suffix with number reverse'],
    ['1.0.0-alpha', '1.0.0-alpha', 0, 'equal suffix'],
    ['1.0.0-alpha', '1.0.0-alpha.0', -1, 'shorter suffix less'],
    ['1.0.0-alpha.0', '1.0.0-alpha', 1, 'longer suffix greater'],
    ['1.0.0', '1', 0, 'short version equal to full'],
    ['1.0.0', '1.0', 0, 'short version equal to full'],
    ['1.0.0.0', '1.0.0', 0, 'extra zero build ignored'],
    ['1.0.0.0', '1.0.0.1', -1, 'extra build compared'],
    ['1.0.0-rc', '1.0.0-rc', 0, 'equal rc suffix'],
    ['1.0.0-rc.1', '1.0.0-rc.2', -1, 'rc suffix with number'],
    ['1.0.0-rc.2', '1.0.0-rc.1', 1, 'rc suffix with number reverse'],
    ['1.0.0-rc.1', '1.0.0-rc.1', 0, 'equal rc suffix with number'],
    ['1.0.0', '2.0.0-alpha', -1, 'major less, ignore suffix'],
    ['2.0.0-alpha', '1.0.0', 1, 'major greater, ignore suffix'],
  ];

  for (const [v1, v2, expected, description] of cases) {
    it(`${description}: compareVersions('${v1}', '${v2}') === ${expected}`, () => {
      assert.strictEqual(compareVersions(v1, v2), expected);
    });
  }
});
