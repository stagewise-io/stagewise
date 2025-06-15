import { expect } from 'vitest';
import { describe, it } from 'vitest';

import { getInstalledDependencies } from '../../utils/lock-file-parsers/npm';

const lockFileV1Dummy = `
{
    "name": "fictional-project",
    "version": "1.0.0",
    "lockfileVersion": 1,
    "requires": true,
    "dependencies": {
      "aurora-validation-engine": {
        "version": "2.1.3",
        "resolved": "https://registry.npmjs.org/aurora-validation-engine/-/aurora-validation-engine-2.1.3.tgz",
        "integrity": "sha512-fictional-integrity-hash-for-aurora-validation-engine",
        "requires": {
          "celestial-data-parser": "1.5.0"
        }
      },
      "celestial-data-parser": {
        "version": "1.5.0",
        "resolved": "https://registry.npmjs.org/celestial-data-parser/-/celestial-data-parser-1.5.0.tgz",
        "integrity": "sha512-fictional-integrity-hash-for-celestial-data-parser"
      },
      "quantum-form-generator": {
        "version": "3.0.1",
        "resolved": "https://registry.npmjs.org/quantum-form-generator/-/quantum-form-generator-3.0.1.tgz",
        "integrity": "sha512-fictional-integrity-hash-for-quantum-form-generator",
        "dev": true,
        "requires": {
          "nebula-styles-loader": "1.2.0"
        }
      },
      "nebula-styles-loader": {
          "version": "1.2.0",
          "resolved": "https://registry.npmjs.org/nebula-styles-loader/-/nebula-styles-loader-1.2.0.tgz",
          "integrity": "sha512-fictional-integrity-hash-for-nebula-styles-loader",
          "dev": true
        },
      "stardust-ui-components": {
        "version": "4.2.0",
        "resolved": "https://registry.npmjs.org/stardust-ui-components/-/stardust-ui-components-4.2.0.tgz",
        "integrity": "sha512-fictional-integrity-hash-for-stardust-ui-components",
        "requires": {
          "aurora-validation-engine": "2.1.3"
        }
      }
    }
  }
`;

const lockFileV2Dummy = `
{
  "name": "fictional-project",
  "version": "1.0.0",
  "lockfileVersion": 2,
  "requires": true,
  "packages": {
    "": {
      "name": "fictional-project",
      "version": "1.0.0",
      "license": "ISC",
      "dependencies": {
        "@faker-js/faker": "^8.4.1",
        "astro-icon": "^1.1.0"
      },
      "devDependencies": {
        "prettier": "^3.2.5",
        "prettier-plugin-astro": "^0.13.0"
      }
    },
    "node_modules/@faker-js/faker": {
      "version": "8.4.1",
      "resolved": "https://registry.npmjs.org/@faker-js/faker/-/faker-8.4.1.tgz",
      "integrity": "sha512-uTzD6S/I1GzyvJ2hA8KN715I221YEGN4IgoV6p3j2D22b8n1iA3T+ySh2a2+Tzf1IZcKDDz9CAS7/jMIk+Qj4w==",
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/fakerjs"
        }
      ],
      "engines": {
        "node": "^18.0.0 || >=20.0.0",
        "npm": ">=8.0.0"
      }
    },
    "node_modules/astro-icon": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/astro-icon/-/astro-icon-1.1.0.tgz",
      "integrity": "sha512-yZtQ3yJmQ2g8vWrDRbbBY0eo/fDMR0lYqgDc+jBfubnqnWpS+5Ck1Z3JCFKo2r2sXp9l96vj9B5WJeuWlAis7A==",
      "dependencies": {
        "iconify-icon": "^1.0.8"
      }
    },
    "node_modules/iconify-icon": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/iconify-icon/-/iconify-icon-1.0.8.tgz",
      "integrity": "sha512-jD5aizPZDOR5B04pZ2r9T1iN7jxk2Yq+YDSi2tX5yJHx+yA3b3yVf9+sWkflE+XlIcjv2S/nZZpMWT4sB2+l4w==",
      "bin": {
        "iconify-icon": "bin/iconify-icon.js"
      }
    },
    "node_modules/prettier": {
      "version": "3.2.5",
      "resolved": "https://registry.npmjs.org/prettier/-/prettier-3.2.5.tgz",
      "integrity": "sha512-3/GWa9aOC0YeD7LUfvOG2gssgXPAwe1p5hYolYlAm0uLhVBEtJDAxWNTAuyMAseadRTVEQYJ24avJloP8+oDdQ==",
      "dev": true,
      "bin": {
        "prettier": "bin/prettier.cjs"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/prettier"
      }
    },
    "node_modules/prettier-plugin-astro": {
      "version": "0.13.0",
      "resolved": "https://registry.npmjs.org/prettier-plugin-astro/-/prettier-plugin-astro-0.13.0.tgz",
      "integrity": "sha512-zLhjS68W2JcJJw0/a/24XzTGS9s3L1sO2Uj3wAtb4URfmbPo1mHagIKXyE8T2JgX8Ea3hwE/y4+W62q2gQGSUg==",
      "dev": true,
      "dependencies": {
        "@astrojs/compiler": "4.4.4",
        "@types/estree": "1.0.5",
        "astro-estree-walker": "2.1.0",
        "prettier": "^3.0.0"
      },
      "engines": {
        "node": ">=18.14.1"
      },
      "peerDependencies": {
        "astro": ">=3.0.0",
        "prettier": "^3.0.0"
      },
      "peerDependenciesMeta": {
        "astro": {
          "optional": true
        }
      }
    },
    "node_modules/prettier-plugin-astro/node_modules/@astrojs/compiler": {
      "version": "4.4.4",
      "resolved": "https://registry.npmjs.org/@astrojs/compiler/-/compiler-4.4.4.tgz",
      "integrity": "sha512-L2G7L6k/dDbrrQkQPO+uDvo/8h4A5f2QkGqWpUeP5T4XoXeiUoQozfPqMhFk72h02p+vJ+/xK1vXpE0v2+v42g==",
      "dev": true,
      "optional": true
    },
    "node_modules/prettier-plugin-astro/node_modules/@types/estree": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.5.tgz",
      "integrity": "sha512-d+wYQ+dZmk62oD1N/aNnAVyvYs93pG/vj2gkoEchjPzYpeoo2qKS1Uprsp2IGzCVOQx1yXm2I5EajrH45QpxiA==",
      "dev": true
    },
    "node_modules/prettier-plugin-astro/node_modules/astro-estree-walker": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/astro-estree-walker/-/astro-estree-walker-2.1.0.tgz",
      "integrity": "sha512-Y4tNGAJQ2yN4B3W/1tV6Vl2JRBtqR8sW2K2Bjm+5MWD6x2bzpFjKAnSJB02Tj0T3v61k/2D3hsS+s+Y1s2aDPA==",
      "dev": true
    },
    "node_modules/prettier-plugin-astro/node_modules/prettier": {
      "version": "3.2.5",
      "resolved": "https://registry.npmjs.org/prettier/-/prettier-3.2.5.tgz",
      "integrity": "sha512-3/GWa9aOC0YeD7LUfvOG2gssgXPAwe1p5hYolYlAm0uLhVBEtJDAxWNTAuyMAseadRTVEQYJ24avJloP8+oDdQ==",
      "dev": true,
      "bin": {
        "prettier": "bin/prettier.cjs"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/prettier"
      }
    }
  }
}
`;

const lockFileV3Dummy = `
{
  "name": "my-fictional-project",
  "version": "2.5.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "my-fictional-project",
      "version": "2.5.0",
      "license": "ISC",
      "dependencies": {
        "awesome-framework": "^7.2.1",
        "data-visualizer": "^3.0.0"
      },
      "devDependencies": {
        "test-runner": "^1.8.2"
      }
    },
    "node_modules/awesome-framework": {
      "version": "7.2.1",
      "resolved": "https://registry.npmjs.org/awesome-framework/-/awesome-framework-7.2.1.tgz",
      "integrity": "sha512-fictional-integrity-string-for-awesome-framework-7.2.1",
      "dependencies": {
        "core-utils": "^4.5.0"
      }
    },
    "node_modules/core-utils": {
      "version": "4.5.0",
      "resolved": "https://registry.npmjs.org/core-utils/-/core-utils-4.5.0.tgz",
      "integrity": "sha512-fictional-integrity-string-for-core-utils-4.5.0"
    },
    "node_modules/data-visualizer": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/data-visualizer/-/data-visualizer-3.0.0.tgz",
      "integrity": "sha512-fictional-integrity-string-for-data-visualizer-3.0.0",
      "dependencies": {
        "charting-library": "^5.1.0"
      }
    },
    "node_modules/charting-library": {
        "version": "5.1.0",
        "resolved": "https://registry.npmjs.org/charting-library/-/charting-library-5.1.0.tgz",
        "integrity": "sha512-fictional-integrity-string-for-charting-library-5.1.0"
    },
    "node_modules/test-runner": {
      "version": "1.8.2",
      "resolved": "https://registry.npmjs.org/test-runner/-/test-runner-1.8.2.tgz",
      "integrity": "sha512-fictional-integrity-string-for-test-runner-1.8.2",
      "dev": true,
      "dependencies": {
        "assertion-lib": "^2.3.1"
      }
    },
    "node_modules/assertion-lib": {
        "version": "2.3.1",
        "resolved": "https://registry.npmjs.org/assertion-lib/-/assertion-lib-2.3.1.tgz",
        "integrity": "sha512-fictional-integrity-string-for-assertion-lib-2.3.1",
        "dev": true
    }
  }
}
`;

describe('npm lock file parser', () => {
  it('should parse npm lock file v1 correctly', () => {
    const dependencies = getInstalledDependencies(lockFileV1Dummy);
    expect(dependencies).to.deep.equal({
      'aurora-validation-engine': '2.1.3',
      'celestial-data-parser': '1.5.0',
      'quantum-form-generator': '3.0.1',
      'nebula-styles-loader': '1.2.0',
      'stardust-ui-components': '4.2.0',
    });
  });

  it('should parse npm lock file v2 correctly', () => {
    const dependencies = getInstalledDependencies(lockFileV2Dummy);
    expect(dependencies).to.deep.equal({
      '@faker-js/faker': '8.4.1',
      'astro-icon': '1.1.0',
      'iconify-icon': '1.0.8',
      prettier: '3.2.5',
      'prettier-plugin-astro': '0.13.0',
      'prettier-plugin-astro/node_modules/@astrojs/compiler': '4.4.4',
      'prettier-plugin-astro/node_modules/@types/estree': '1.0.5',
      'prettier-plugin-astro/node_modules/astro-estree-walker': '2.1.0',
      'prettier-plugin-astro/node_modules/prettier': '3.2.5',
    });
  });

  it('should parse npm lock file v3 correctly', () => {
    const dependencies = getInstalledDependencies(lockFileV3Dummy);
    expect(dependencies).to.deep.equal({
      'awesome-framework': '7.2.1',
      'core-utils': '4.5.0',
      'data-visualizer': '3.0.0',
      'charting-library': '5.1.0',
      'test-runner': '1.8.2',
      'assertion-lib': '2.3.1',
    });
  });

  it('should handle empty lock file', () => {
    const dependencies = getInstalledDependencies('{}');
    expect(dependencies).to.deep.equal({});
  });
});
