import { expect } from 'vitest';
import { describe, it } from 'vitest';
import { getInstalledDependencies } from '../../utils/lock-file-parsers/bun';

const lockFileDummy = `
{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "cosmic-renderer",
      "dependencies": {
        "@orbital/engine": "^2.5.1",
        "@stellar/logger": "^1.2.0",
        "astro-color-utils": "^3.0.0",
        "gl-matrix-next": "^4.2.1",
        "hyperspace-router": "^6.8.0",
        "nano-scheduler": "^0.9.5",
        "quantum-events": "^1.1.0"
      },
      "devDependencies": {
        "@types/bun": "latest",
        "eslint-plugin-cosmic": "^0.5.2",
        "prettier-config-nebula": "^1.0.0"
      },
      "peerDependencies": {
        "typescript": "^5.2.0"
      }
    }
  },
  "packages": {
    "@orbital/engine": ["@orbital/engine@2.5.1", "", { "dependencies": { "gl-matrix-next": "^4.2.0", "nano-scheduler": "^0.9.5" } }, "sha512-aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgH=="],
    "@stellar/logger": ["@stellar/logger@1.2.0", "", { "dependencies": { "astro-color-utils": "^3.0.0" } }, "sha512-1234567890aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwX=="],
    "@types/bun": ["@types/bun@1.0.12", "", { "dependencies": { "bun-types": "1.0.12" } }, "sha512-lY/GQTXDGsolT/TiH72p1tuyUORuRrdV7VwOTOjDOt8uTBJQOJc5zz3ufwwDl0VBaoxotSk4LdP0hhjLJ6ypIQ=="],
    "astro-color-utils": ["astro-color-utils@3.0.0", "", {}, "sha512-zYXwVuBaDcFeDgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZa=="],
    "bun-types": ["bun-types@1.0.12", "", { "dependencies": { "@types/node": "*" } }, "sha512-tvWMx5vPqbRXgE8WUZI94iS1xAYs8bkqESR9cxBB1Wi+urvfTrF1uzuDgBHFAdO0+d2lmsbG3HmeKMvUyj6pWA=="],
    "eslint-plugin-cosmic": ["eslint-plugin-cosmic@0.5.2", "", {}, "sha512-eSlInTCoSmIcPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUgInPlUg=="],
    "gl-matrix-next": ["gl-matrix-next@4.2.1", "", {}, "sha512-gLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqR=="],
    "hyperspace-router": ["hyperspace-router@6.8.0", "", { "dependencies": { "path-to-regexp": "^6.2.0" } }, "sha512-hYpErSpAcE-rOuTeR-oUtErSpAcE-rOuTeR-oUtErSpAcE-rOuTeR-oUtErSpAcE-rOuTeR-oUtErSpAcE-rOu=="],
    "nano-scheduler": ["nano-scheduler@0.9.5", "", {}, "sha512-nAnOsChEdUlErScHeDuLeErScHeDuLeErScHeDuLeErScHeDuLeErScHeDuLeErScHeDuLeErScHeDuLeErScHeD=="],
    "path-to-regexp": ["path-to-regexp@6.2.0", "", {}, "sha512-pAtHtOrEgExPrEsS-pAtHtOrEgExPrEsS-pAtHtOrEgExPrEsS-pAtHtOrEgExPrEsS-pAtHtOrEgExPrEsS-pAt=="],
    "prettier-config-nebula": ["prettier-config-nebula@1.0.0", "", {}, "sha512-pReTtIeRcOnFiGnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlAnEbUlA=="],
    "quantum-events": ["quantum-events@1.1.0", "", {}, "sha512-qUaNtUmEvEnTsQuAnTuMeVeNtS-qUaNtUmEvEnTsQuAnTuMeVeNtS-qUaNtUmEvEnTsQuAnTuMeVeNtS-qUaN=="],
    "typescript": ["typescript@5.3.3", "", { "bin": { "tsc": "bin/tsc", "tsserver": "bin/tsserver" } }, "sha512-p1diW6TqL9L07nNxvRMM7hMMw4c5XOo/1ibL4aAIGmSAt9slTE1Xgw5KWuof2uTOvCg9BY7ZRi+GaF+7sfgPeQ=="]
  }
}
`;

describe('bun lock file parser', () => {
  it('should parse bun lock file correctly', () => {
    const dependencies = getInstalledDependencies(lockFileDummy);
    expect(dependencies).to.deep.equal({
      '@orbital/engine': '2.5.1',
      '@stellar/logger': '1.2.0',
      'astro-color-utils': '3.0.0',
      'gl-matrix-next': '4.2.1',
      'hyperspace-router': '6.8.0',
      'nano-scheduler': '0.9.5',
      'quantum-events': '1.1.0',
      '@types/bun': '1.0.12',
      'eslint-plugin-cosmic': '0.5.2',
      'prettier-config-nebula': '1.0.0',
      'bun-types': '1.0.12',
      'path-to-regexp': '6.2.0',
      typescript: '5.3.3',
    });
  });

  it('should handle empty lock file', () => {
    const dependencies = getInstalledDependencies('{}');
    expect(dependencies).to.deep.equal({});
  });
});
