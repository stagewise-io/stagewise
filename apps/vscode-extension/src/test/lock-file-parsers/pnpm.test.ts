import { expect } from 'vitest';
import { describe, it } from 'vitest';
import { getInstalledDependencies } from '../../utils/lock-file-parsers/pnpm';

const lockFileDummy = `
lockfileVersion: 5.4

importers:

  .:
    specifiers:
      react: ^18.2.0
      react-dom: ^18.2.0
      lodash: ^4.17.21
      '@types/node': ^20.11.20
      eslint: ^8.57.0
      typescript: ^5.3.3
    dependencies:
      react: 18.2.0
      react-dom: 18.2.0_react@18.2.0
      lodash: 4.17.21
    devDependencies:
      '@types/node': 20.11.30
      eslint: 8.57.0
      typescript: 5.4.2

packages:

  '/@types/node/20.11.30':
    resolution: {integrity: sha512-dHM6n2GzbTaSAe2gPBPay326iNo/yJE20d91m2M93rVICV6Vllu3iV2AM5T7MxcghvY142yqL2gBHs56pyWWtA==}
    dev: true

  '/ajv/6.12.6':
    resolution: {integrity: sha512-j3fpaBjpS33vxFkXAhbJemmdSA8ZsbEePwnOwV6Im3p642O7jcUjSo1/2ALRxLawoUjss1tYty2FIL/S+As+A2g==}
    dependencies:
      fast-deep-equal: 3.1.3
      fast-json-stable-stringify: 2.1.0
      json-schema-traverse: 0.4.1
      uri-js: 4.4.1
    dev: true

  '/eslint/8.57.0':
    resolution: {integrity: sha512-sRE8oT8ElFaoI2M3U3e5dsYIe2lG2I6g2xastN5bYy9e1GvY/9L1dDLSJgr2+1k3fT5Q2s9v+9mAeJ3xT2WGGA==}
    engines: {node: ^12.22.0 || ^14.17.0 || >=16.0.0}
    dependencies:
      ajv: 6.12.6
      espree: 9.6.1
      glob-parent: 6.0.2
      ignore: 5.3.1
    transitivePeerDependencies:
      - supports-color
    dev: true

  '/espree/9.6.1':
    resolution: {integrity: sha512-oruZaFkjorT3mEp2N2I2Tfg9Pe8qjVl33P8iR2e2oKzT82bI/aCMaD+h2dNIxMUnF++g43h23nQ8VvIFCrIe5w==}
    engines: {node: ^12.22.0 || ^14.17.0 || >=16.0.0}
    dependencies:
      acorn: 8.11.3
      acorn-jsx: 5.3.2
      eslint-visitor-keys: 3.4.3
    dev: true

  '/acorn/8.11.3':
    resolution: {integrity: sha512-Y9r+t3dPkPBIbZNIy3sBqfTdoD2vNOGy2DcrFdePGrvLg8YlTfgqk5p2crhKjQzWbg9HvrzD0+cFgWee42D39Q==}
    engines: {node: '>=0.4.0'}
    dev: true

  '/acorn-jsx/5.3.2':
    resolution: {integrity: sha512-rq9s+Jito28o62iAyVfN/c3tqIwPykXkxGBeqL41s+93i4wCEh3bmywE/3UR5b3sN46k2UeM/Y3oU+0hD/2aGg==}
    dependencies:
      acorn: 8.11.3
    dev: true

  '/eslint-visitor-keys/3.4.3':
    resolution: {integrity: sha512-w6h311F/EaDngm1i2g2I1Qp2d23nANc2WNbS7pWTqugXgJ2y+NbL9bLz1PibH6D6eP+cmg2f15kI+S5wMGRbRA==}
    engines: {node: ^12.22.0 || ^14.17.0 || >=16.0.0}
    dev: true

  '/fast-deep-equal/3.1.3':
    resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H93q9BEsoUsaeepo6J4K/MV963pSUB+ARsA1zz9Dru6a4zKqjbpZhY9HaltqJOUa/WCYzw==}
    dev: true

  '/fast-json-stable-stringify/2.1.0':
    resolution: {integrity: sha512-lhd/wF+Lk98HZoTCtlVraHtfh5DPNcJ_CRrUADtTVoLAI2ah2EzAWO1gjE9gWyr2dPnRTf7X0QjEz+x+9fNdag==}
    dev: true

  '/glob-parent/6.0.2':
    resolution: {integrity: sha512-XxwI8EOhVQgWp6iDL+3b0r86f4d/ll2NsnN3zAN7onUrD6IOl9iOkIEnLx5+Ovo86lA9+smfs3I3bztpZCrx4A==}
    engines: {node: '>=10.13.0'}
    dependencies:
      is-glob: 4.0.3
    dev: true

  '/ignore/5.3.1':
    resolution: {integrity: sha512-hpxhBMareQucp27yT3lHlZj9mG320Oi1aQ8AJ21319d2n2Sv3a436d1o2pT21dBN2YVVIK/1Jka3hve1Fm21g==}
    engines: {node: '>= 4'}
    dev: true

  '/is-glob/4.0.3':
    resolution: {integrity: sha512-xelSayIfrxgSj6w9I9uHvrntU2Zot8so6FwSjkKcmv9KjIOrzIZ/cE6bJt8sy29C+lna4BqjW3QO8E/fiK9DKw==}
    engines: {node: '>=0.10.0'}
    dependencies:
      is-extglob: 2.1.1
    dev: true

  '/is-extglob/2.1.1':
    resolution: {integrity: sha512-ja2A2cJot8A1D5Ckn1D/i2n6d/ph29lt2l660706h4Vb4bGYBquA8g3o5iin6h/2cbx+2yqY13D3IGB/4S/2Qg==}
    engines: {node: '>=0.10.0'}
    dev: true

  '/json-schema-traverse/0.4.1':
    resolution: {integrity: sha512-xbbCH5d9DPC4QYliSpC8eS2pAI2ePE3DW22/M3T1vH35MCi9p1i3hBfSgX5q3b0kgt2vj3R4v9ZdCA4iC/H6rw==}
    dev: true

  '/lodash/4.17.21':
    resolution: {integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==}
    dev: false

  '/loose-envify/1.4.0':
    resolution: {integrity: sha512-lyuxPGr/Wfhrlem2CL/UcnUc1zcqKA3a2eA3M-5IpTeUa2rDkyLaj9OPY2M/iXgoSXymUxx+2NsOS1wUabI9iw==}
    dependencies:
      js-tokens: 4.0.0
    dev: false

  '/js-tokens/4.0.0':
    resolution: {integrity: sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==}
    dev: false

  '/punycode/2.3.1':
    resolution: {integrity: sha512-vQ_tbEBf6B4Y2mKstGUTj2G/qN21xdSSs2YUOc3sR/ZiQfkyx1BCv+s3iH1oWe8uMP1as+f/eyX9eC9p6C21CA==}
    engines: {node: '>=6'}
    dev: true

  '/react-dom/18.2.0_react@18.2.0':
    resolution: {integrity: sha512-6IMTriUmvsjHUjNtEDudZfuDQUoWdvvomIsA0Xjg0kWK/DBLAu0pDjWi8+4CV+jcExXOtO6RAA+/u4c12v1JvQ==}
    peerDependencies:
      react: ^18.2.0
    dependencies:
      react: 18.2.0
      loose-envify: 1.4.0
      scheduler: 0.23.0
    dev: false

  '/react/18.2.0':
    resolution: {integrity: sha512-/3IjMdbBGYg_pGrCo1M4IIgsoM9doAT0eb/hdeJ/T3+tOEbM2ePrmHMo3VolV22t2TMbTepWeA2ZD16mJ5vLSg==}
    engines: {node: '>=0.10.0'}
    dependencies:
      loose-envify: 1.4.0
    dev: false

  '/scheduler/0.23.0':
    resolution: {integrity: sha512-CtuThmgHNg7zIZERE90fY_1cibsTbo0kJBkFCkIe9zIeP2htG21CWg+H0B0XF9T/ohB7F2TUrC3cifEmu4JcnA==}
    dependencies:
      loose-envify: 1.4.0
    dev: false

  '/typescript/5.4.2':
    resolution: {integrity: sha512-EgI2IaeaGBZ/0SBFY1HWvm2c2uSAjBfb+nZqVAIv9ws9U0g3V1Jk75Qmp3G2kflL4zmMwPA7i429zU8xWzM+Tw==}
    engines: {node: '>=14.17'}
    hasBin: true
    dev: true

  '/uri-js/4.4.1':
    resolution: {integrity: sha512-7rOrAaA23ZG1up3s+2hR0d2Gg2+2uJfm2eN7/4Bv/GTo8A7tzS1I82gIu4B0j24d2teKzD+B1G3p5oT60iL2g==}
    dependencies:
      punycode: 2.3.1
    dev: true
`;

describe('pnpm lock file parser', () => {
  it('should parse pnpm lock file correctly', () => {
    const dependencies = getInstalledDependencies(lockFileDummy);
    expect(dependencies).to.deep.equal({
      react: '18.2.0',
      'react-dom': '18.2.0',
      lodash: '4.17.21',
      '@types/node': '20.11.30',
      eslint: '8.57.0',
      typescript: '5.4.2',
      ajv: '6.12.6',
      espree: '9.6.1',
      acorn: '8.11.3',
      'acorn-jsx': '5.3.2',
      'eslint-visitor-keys': '3.4.3',
      'fast-deep-equal': '3.1.3',
      'fast-json-stable-stringify': '2.1.0',
      'glob-parent': '6.0.2',
      ignore: '5.3.1',
      'is-glob': '4.0.3',
      'is-extglob': '2.1.1',
      'json-schema-traverse': '0.4.1',
      'loose-envify': '1.4.0',
      'js-tokens': '4.0.0',
      punycode: '2.3.1',
      scheduler: '0.23.0',
      'uri-js': '4.4.1',
    });
  });

  it('should handle empty lock file', () => {
    const dependencies = getInstalledDependencies('');
    expect(dependencies).to.deep.equal({});
  });
});
