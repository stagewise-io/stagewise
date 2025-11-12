import { describe, it, expect } from 'vitest';
import { ClientRuntimeMock } from '@stagewise/agent-runtime-mock';
import {
  getFrameworksForPackage,
  Framework,
} from './get-frameworks-for-package.js';

describe('getFrameworksForPackage', () => {
  it('should detect Next.js framework with React', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/nextjs-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/nextjs-app/package.json': JSON.stringify({
          name: 'nextjs-app',
          dependencies: {
            next: '13.5.0',
            react: '18.0.0',
            'react-dom': '18.0.0',
          },
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/nextjs-app',
    );

    expect(result.path).toBe('/project/nextjs-app');
    expect(result.metaFrameworks).toHaveLength(1);
    expect(result.metaFrameworks[0]?.framework).toBe(Framework.NEXTJS);
    expect(result.metaFrameworks[0]?.version).toBe('13.5.0');
    expect(result.metaFrameworks[0]?.foundIn).toContain('dependencies');
    expect(result.metaFrameworks[0]?.foundIn).toContain('scripts');

    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.REACT);
    expect(result.frontendFrameworks[0]?.version).toBe('18.0.0');
    expect(result.frontendFrameworks[0]?.foundIn).toEqual(['dependencies']);
  });

  it('should detect Angular framework', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/angular-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/angular-app/package.json': JSON.stringify({
          name: 'angular-app',
          dependencies: {
            '@angular/core': '^16.0.0',
            '@angular/common': '^16.0.0',
            '@angular/platform-browser': '^16.0.0',
          },
          devDependencies: {
            '@angular/cli': '^16.0.0',
          },
          scripts: {
            ng: 'ng',
            start: 'ng serve',
            build: 'ng build',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/angular-app',
    );

    expect(result.path).toBe('/project/angular-app');
    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.ANGULAR);
    expect(result.frontendFrameworks[0]?.version).toBe('^16.0.0');
    expect(result.frontendFrameworks[0]?.foundIn).toContain('dependencies');
    expect(result.frontendFrameworks[0]?.foundIn).toContain('devDependencies');
    expect(result.frontendFrameworks[0]?.foundIn).toContain('scripts');
    expect(result.metaFrameworks).toHaveLength(0);
  });

  it('should detect Vue.js with Vite', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/vue-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/vue-app/package.json': JSON.stringify({
          name: 'vue-app',
          dependencies: {
            vue: '^3.3.0',
          },
          devDependencies: {
            '@vitejs/plugin-vue': '^4.0.0',
            vite: '^4.5.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/vue-app',
    );

    expect(result.path).toBe('/project/vue-app');
    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.VUE);
    expect(result.frontendFrameworks[0]?.version).toBe('^3.3.0');
    expect(result.frontendFrameworks[0]?.foundIn).toEqual(['dependencies']);

    expect(result.buildTools).toHaveLength(1);
    expect(result.buildTools[0]?.framework).toBe(Framework.VITE);
    expect(result.buildTools[0]?.version).toBe('^4.5.0');
    expect(result.buildTools[0]?.foundIn).toEqual(['devDependencies']);
  });

  it('should detect Nuxt.js with Vue.js listed separately', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/nuxt-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/nuxt-app/package.json': JSON.stringify({
          name: 'nuxt-app',
          dependencies: {
            nuxt: '^3.8.0',
            vue: '^3.3.0',
          },
          scripts: {
            dev: 'nuxt dev',
            build: 'nuxt build',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/nuxt-app',
    );

    expect(result.path).toBe('/project/nuxt-app');
    expect(result.metaFrameworks).toHaveLength(1);
    expect(result.metaFrameworks[0]?.framework).toBe(Framework.NUXTJS);
    expect(result.metaFrameworks[0]?.version).toBe('^3.8.0');
    expect(result.metaFrameworks[0]?.foundIn).toContain('dependencies');
    expect(result.metaFrameworks[0]?.foundIn).toContain('scripts');

    // Vue should still be detected as it's explicitly listed
    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.VUE);
  });

  it('should detect SvelteKit with Svelte', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/sveltekit-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/sveltekit-app/package.json': JSON.stringify({
          name: 'sveltekit-app',
          devDependencies: {
            '@sveltejs/kit': '^1.20.0',
            '@sveltejs/adapter-auto': '^2.0.0',
            svelte: '^4.0.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/sveltekit-app',
    );

    expect(result.path).toBe('/project/sveltekit-app');
    expect(result.metaFrameworks).toHaveLength(1);
    expect(result.metaFrameworks[0]?.framework).toBe(Framework.SVELTEKIT);
    expect(result.metaFrameworks[0]?.version).toBe('^1.20.0');
    expect(result.metaFrameworks[0]?.foundIn).toEqual(['devDependencies']);

    // Svelte should also be detected
    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.SVELTE);
  });

  it('should detect SolidStart with Solid.js', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/solid-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/solid-app/package.json': JSON.stringify({
          name: 'solid-app',
          dependencies: {
            '@solidjs/start': '^0.3.0',
            'solid-js': '^1.8.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/solid-app',
    );

    expect(result.path).toBe('/project/solid-app');
    expect(result.metaFrameworks).toHaveLength(1);
    expect(result.metaFrameworks[0]?.framework).toBe(Framework.SOLIDSTART);
    expect(result.metaFrameworks[0]?.version).toBe('^0.3.0');
    expect(result.metaFrameworks[0]?.foundIn).toEqual(['dependencies']);

    // Solid should also be detected
    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.SOLID);
  });

  it('should detect React with Vite and Jest', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/react-app',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/react-app/package.json': JSON.stringify({
          name: 'react-app',
          dependencies: {
            react: '18.2.0',
            'react-dom': '18.2.0',
          },
          devDependencies: {
            '@vitejs/plugin-react': '^4.0.0',
            vite: '^4.5.0',
            jest: '^29.0.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/react-app',
    );

    expect(result.path).toBe('/project/react-app');
    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.REACT);
    expect(result.frontendFrameworks[0]?.version).toBe('18.2.0');
    expect(result.frontendFrameworks[0]?.foundIn).toEqual(['dependencies']);

    expect(result.buildTools).toHaveLength(1);
    expect(result.buildTools[0]?.framework).toBe(Framework.VITE);

    expect(result.testingFrameworks).toHaveLength(1);
    expect(result.testingFrameworks[0]?.framework).toBe(Framework.JEST);
  });

  it('should detect Express backend', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/express-api',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/express-api/package.json': JSON.stringify({
          name: 'express-api',
          dependencies: {
            express: '^4.18.0',
            cors: '^2.8.5',
          },
          devDependencies: {
            jest: '^29.0.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/express-api',
    );

    expect(result.path).toBe('/project/express-api');
    expect(result.backendFrameworks).toHaveLength(1);
    expect(result.backendFrameworks[0]?.framework).toBe(Framework.EXPRESS);
    expect(result.backendFrameworks[0]?.version).toBe('^4.18.0');
    expect(result.backendFrameworks[0]?.foundIn).toEqual(['dependencies']);

    expect(result.testingFrameworks).toHaveLength(1);
    expect(result.testingFrameworks[0]?.framework).toBe(Framework.JEST);
    expect(result.frontendFrameworks).toHaveLength(0);
  });

  it('should detect NestJS backend', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/nestjs-api',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/nestjs-api/package.json': JSON.stringify({
          name: 'nestjs-api',
          dependencies: {
            '@nestjs/core': '^10.0.0',
            '@nestjs/common': '^10.0.0',
          },
          devDependencies: {
            jest: '^29.0.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/nestjs-api',
    );

    expect(result.path).toBe('/project/nestjs-api');
    expect(result.backendFrameworks).toHaveLength(1);
    expect(result.backendFrameworks[0]?.framework).toBe(Framework.NESTJS);
    expect(result.backendFrameworks[0]?.version).toBe('^10.0.0');
    expect(result.testingFrameworks).toHaveLength(1);
    expect(result.testingFrameworks[0]?.framework).toBe(Framework.JEST);
  });

  it('should detect only build tools when no frameworks present', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/build-only',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/build-only/package.json': JSON.stringify({
          name: 'build-only',
          devDependencies: {
            webpack: '^5.0.0',
            'webpack-cli': '^5.0.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/build-only',
    );

    expect(result.path).toBe('/project/build-only');
    expect(result.buildTools).toHaveLength(1);
    expect(result.buildTools[0]?.framework).toBe(Framework.WEBPACK);
    expect(result.buildTools[0]?.version).toBe('^5.0.0');
    expect(result.buildTools[0]?.foundIn).toEqual(['devDependencies']);
    expect(result.frontendFrameworks).toHaveLength(0);
    expect(result.backendFrameworks).toHaveLength(0);
  });

  it('should detect only testing frameworks', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/test-only',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/test-only/package.json': JSON.stringify({
          name: 'test-only',
          devDependencies: {
            vitest: '^0.34.0',
            '@vitest/ui': '^0.34.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/test-only',
    );

    expect(result.path).toBe('/project/test-only');
    expect(result.testingFrameworks).toHaveLength(1);
    expect(result.testingFrameworks[0]?.framework).toBe(Framework.VITEST);
    expect(result.testingFrameworks[0]?.version).toBe('^0.34.0');
    expect(result.testingFrameworks[0]?.foundIn).toEqual(['devDependencies']);
    expect(result.frontendFrameworks).toHaveLength(0);
  });

  it('should handle projects without package.json', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/no-package',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/no-package/README.md': '# No package.json here',
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/no-package',
    );

    expect(result.path).toBe('/project/no-package');
    expect(result.metaFrameworks).toHaveLength(0);
    expect(result.frontendFrameworks).toHaveLength(0);
    expect(result.backendFrameworks).toHaveLength(0);
    expect(result.buildTools).toHaveLength(0);
    expect(result.testingFrameworks).toHaveLength(0);
  });

  it('should handle malformed package.json gracefully', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/malformed',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/malformed/package.json': '{invalid json}',
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/malformed',
    );

    // Should return empty results
    expect(result.path).toBe('/project/malformed');
    expect(result.metaFrameworks).toHaveLength(0);
    expect(result.frontendFrameworks).toHaveLength(0);
    expect(result.backendFrameworks).toHaveLength(0);
    expect(result.buildTools).toHaveLength(0);
    expect(result.testingFrameworks).toHaveLength(0);
  });

  it('should detect multiple frameworks in same category', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/multi-same-category',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/multi-same-category/package.json': JSON.stringify({
          name: 'multi-same-category',
          dependencies: {
            vue: '3.0.0',
            react: '18.0.0',
            preact: '10.0.0',
          },
          devDependencies: {
            '@angular/core': '^16.0.0',
            '@angular/cli': '^16.0.0',
          },
          scripts: {
            ng: 'ng',
            start: 'ng serve',
            build: 'ng build',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/multi-same-category',
    );

    expect(result.path).toBe('/project/multi-same-category');
    // Should detect all frontend frameworks
    expect(result.frontendFrameworks).toHaveLength(4);

    const frameworks = result.frontendFrameworks.map((f) => f.framework).sort();
    expect(frameworks).toEqual(
      [
        Framework.ANGULAR,
        Framework.PREACT,
        Framework.REACT,
        Framework.VUE,
      ].sort(),
    );

    // Check Angular has multiple sources
    const angular = result.frontendFrameworks.find(
      (f) => f.framework === Framework.ANGULAR,
    );
    expect(angular?.foundIn).toContain('devDependencies');
    expect(angular?.foundIn).toContain('scripts');
  });

  it('should handle version cleaning correctly', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/version-test',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/version-test/package.json': JSON.stringify({
          name: 'version-test',
          dependencies: {
            react: '^18.2.0',
          },
          devDependencies: {
            vite: '~4.5.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/version-test',
    );

    expect(result.path).toBe('/project/version-test');
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.REACT);
    expect(result.frontendFrameworks[0]?.version).toBe('^18.2.0'); // Should preserve ^ prefix
    expect(result.buildTools[0]?.version).toBe('~4.5.0'); // Should preserve ~ prefix
  });

  it('should handle framework detection with scripts only', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/scripts-only',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/scripts-only/package.json': JSON.stringify({
          name: 'scripts-only',
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          // No dependencies, only scripts
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/scripts-only',
    );

    expect(result.path).toBe('/project/scripts-only');
    expect(result.metaFrameworks).toHaveLength(1);
    expect(result.metaFrameworks[0]?.framework).toBe(Framework.NEXTJS);
    expect(result.metaFrameworks[0]?.foundIn).toEqual(['scripts']);
  });

  it('should handle empty package.json', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/empty',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/empty/package.json': JSON.stringify({
          name: 'empty-project',
        }),
      },
    });

    const result = await getFrameworksForPackage(mockRuntime, '/project/empty');

    expect(result.path).toBe('/project/empty');
    expect(result.metaFrameworks).toHaveLength(0);
    expect(result.frontendFrameworks).toHaveLength(0);
    expect(result.backendFrameworks).toHaveLength(0);
    expect(result.buildTools).toHaveLength(0);
    expect(result.testingFrameworks).toHaveLength(0);
  });

  it('should handle co-existing frameworks in different categories', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/full-stack',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/full-stack/package.json': JSON.stringify({
          name: 'full-stack',
          dependencies: {
            next: '13.0.0',
            react: '18.0.0',
            express: '4.18.0',
          },
          devDependencies: {
            vite: '4.5.0',
            jest: '29.0.0',
            webpack: '5.0.0',
            vitest: '0.34.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/full-stack',
    );

    expect(result.path).toBe('/project/full-stack');

    // Should detect one framework from each category
    expect(result.metaFrameworks).toHaveLength(1);
    expect(result.metaFrameworks[0]?.framework).toBe(Framework.NEXTJS);

    expect(result.frontendFrameworks).toHaveLength(1);
    expect(result.frontendFrameworks[0]?.framework).toBe(Framework.REACT);

    expect(result.backendFrameworks).toHaveLength(1);
    expect(result.backendFrameworks[0]?.framework).toBe(Framework.EXPRESS);

    // Should detect both build tools
    expect(result.buildTools).toHaveLength(2);
    const buildTools = result.buildTools.map((t) => t.framework).sort();
    expect(buildTools).toEqual([Framework.VITE, Framework.WEBPACK].sort());

    // Should detect both testing frameworks
    expect(result.testingFrameworks).toHaveLength(2);
    const testTools = result.testingFrameworks.map((t) => t.framework).sort();
    expect(testTools).toEqual([Framework.JEST, Framework.VITEST].sort());
  });

  it('should detect frameworks from peerDependencies', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/peer-deps',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/peer-deps/package.json': JSON.stringify({
          name: 'peer-deps-package',
          peerDependencies: {
            react: '>=16.8.0',
            vue: '>=3.0.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/peer-deps',
    );

    expect(result.path).toBe('/project/peer-deps');
    expect(result.frontendFrameworks).toHaveLength(2);

    const react = result.frontendFrameworks.find(
      (f) => f.framework === Framework.REACT,
    );
    expect(react?.foundIn).toEqual(['peerDependencies']);
    expect(react?.version).toBe('>=16.8.0');

    const vue = result.frontendFrameworks.find(
      (f) => f.framework === Framework.VUE,
    );
    expect(vue?.foundIn).toEqual(['peerDependencies']);
    expect(vue?.version).toBe('>=3.0.0');
  });

  it('should merge foundIn sources when framework appears in multiple places', async () => {
    const mockRuntime = new ClientRuntimeMock({
      workingDirectory: '/project/multiple-sources',
      ripgrepBasePath: '',
      initialFiles: {
        '/project/multiple-sources/package.json': JSON.stringify({
          name: 'multiple-sources',
          dependencies: {
            vite: '4.0.0',
          },
          devDependencies: {
            vite: '4.5.0',
          },
        }),
      },
    });

    const result = await getFrameworksForPackage(
      mockRuntime,
      '/project/multiple-sources',
    );

    expect(result.path).toBe('/project/multiple-sources');
    expect(result.buildTools).toHaveLength(1);
    expect(result.buildTools[0]?.framework).toBe(Framework.VITE);
    expect(result.buildTools[0]?.version).toBe('4.0.0'); // Takes first found version
    expect(result.buildTools[0]?.foundIn).toContain('dependencies');
    expect(result.buildTools[0]?.foundIn).toContain('devDependencies');
  });
});
