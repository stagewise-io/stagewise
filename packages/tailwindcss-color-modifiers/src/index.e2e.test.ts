// src/index.e2e.test.ts
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

// Resolve the absolute path to tailwindcss so it can be imported from temp dirs
const require = createRequire(import.meta.url);
const tailwindCssPath = path.dirname(
  require.resolve('tailwindcss/package.json'),
);

// Resolve the plugin path (use built dist for reliable ESM loading)
const pluginPath = path
  .resolve(__dirname, '../dist/index.js')
  .replace(/\\/g, '/');

async function buildCssWithTempProject(rawHtml: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tw-color-mods-'));

  // 1) content file (scanned by @source)
  const contentPath = path.join(dir, 'content.html');
  await writeFile(contentPath, rawHtml, 'utf8');

  // 2) Create a legacy tailwind.config.js that loads the plugin with options
  //    This is the v4-compatible way to load v3-style JS plugins with theme access
  const configPath = path.join(dir, 'tailwind.config.js');
  const configContent = `
import colorModifiers from "${pluginPath}";

export default {
  // Explicitly limit content scanning to just our test file
  content: ["./content.html"],
  theme: {
    colors: {
      "green-300": "#86efac",
      "blue-500": "#3b82f6",
      "red-500": "#ef4444",
    },
  },
  plugins: [colorModifiers({ warn: true })],
};
`;
  await writeFile(configPath, configContent, 'utf8');

  // 3) Tailwind input CSS (Tailwind v4 style)
  //    - Use absolute path for tailwindcss import
  //    - Use @config directive to load the legacy config with plugin
  //    - Content is specified in the config, so no @source needed here
  const inputCssPath = path.join(dir, 'input.css');
  const inputCss = `
@import "${tailwindCssPath}";
@config "./tailwind.config.js";
`;
  await writeFile(inputCssPath, inputCss, 'utf8');

  // 4) Run PostCSS + Tailwind PostCSS plugin
  const result = await postcss([tailwind()]).process(inputCss, {
    from: inputCssPath,
  });

  return result.css;
}

// These e2e tests verify the plugin works with Tailwind v4 via the @config
// directive, which loads a legacy config file containing the v3-style JS plugin.
// This is the recommended way to use v3 plugins with v4's compatibility layer.
//
// NOTE: In Tailwind v4, modifiers must use arbitrary value syntax [modifier]
// to bypass v4's built-in opacity parsing. Without brackets, v4 interprets
// the modifier as an opacity value and applies color-mix before our plugin sees it.
//
// NOTE: v4 provides colors in oklch format (e.g., oklch(87.1% 0.15 154.449))
// rather than hex format (#86efac), so tests check for oklch(from oklch(...)).
describe('tailwindcss-color-modifiers (e2e)', () => {
  it('generates modified background colors via bg-* modifier', async () => {
    // Use arbitrary modifier syntax [l+2] to bypass v4's opacity parsing
    const css = await buildCssWithTempProject(
      `<div class="bg-green-300/[l+2]"></div>`,
    );

    // v4 provides colors in oklch format
    expect(css).toContain('background-color:');
    expect(css).toContain('oklch(from oklch(');
    expect(css).toContain('calc(L + 0.02)');
    expect(css).toContain('/ alpha');
  });

  it('generates modified gradient stop colors via from-* modifier', async () => {
    const css = await buildCssWithTempProject(
      `<div class="bg-gradient-to-r from-blue-500/[h+10] to-red-500"></div>`,
    );

    expect(css).toContain('--tw-gradient-from:');
    expect(css).toContain('oklch(from oklch(');
    expect(css).toContain('calc(h + 10)'); // h is unitless degrees in oklch relative syntax
  });

  it('does not hijack Tailwind opacity modifiers like bg-*/50', async () => {
    const css = await buildCssWithTempProject(
      `<div class="bg-green-300/50"></div>`,
    );

    // Numeric modifiers like /50 should use Tailwind's built-in opacity handling
    // The .bg-green-300\/50 class should use color-mix, not oklch(from ...)
    // Note: Other classes may use oklch(from...) due to v4's utility generation,
    // but the /50 opacity modifier should NOT trigger our plugin's output.

    // Check that the specific opacity class exists and uses color-mix
    expect(css).toContain('.bg-green-300\\/50');
    expect(css).toContain('color-mix(');

    // Extract just the .bg-green-300/50 rule and verify it doesn't use oklch(from
    const match = css.match(/\.bg-green-300\\\/50\s*\{[^}]+\}/);
    expect(match).toBeTruthy();
    const rule = match![0];
    expect(rule).not.toContain('oklch(from');
  });

  it('supports separators and multiple ops in one modifier', async () => {
    const css = await buildCssWithTempProject(
      `<div class="border-green-300/[l+0.02_c-0.04_h+10]"></div>`,
    );

    expect(css).toContain('border-color:');
    expect(css).toContain('oklch(from oklch(');
    expect(css).toContain('calc(L + 0.02)');
    expect(css).toContain('calc(C - 0.04)');
    expect(css).toContain('calc(h + 10)'); // h is unitless degrees in oklch relative syntax
  });

  it('supports multiply (x) and divide (d) operations', async () => {
    const css = await buildCssWithTempProject(
      `<div class="bg-blue-500/lx1.2 text-green-300/cd2"></div>`,
    );

    // Check multiply: lx1.2 should produce calc(L * 1.2)
    expect(css).toContain('calc(L * 1.2)');

    // Check divide: cd2 should produce calc(C / 2)
    expect(css).toContain('calc(C / 2)');
  });

  it('supports multiply/divide with bracket syntax', async () => {
    const css = await buildCssWithTempProject(
      `<div class="bg-green-300/[l*1.5] border-blue-500/[c/3]"></div>`,
    );

    expect(css).toContain('calc(L * 1.5)');
    expect(css).toContain('calc(C / 3)');
  });
});

describe('tailwindcss-color-modifiers extend option (e2e)', () => {
  async function buildCssWithExtend(
    rawHtml: string,
    extend: Record<string, string>,
  ) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tw-color-mods-extend-'));

    // 1) content file
    const contentPath = path.join(dir, 'content.html');
    await writeFile(contentPath, rawHtml, 'utf8');

    // 2) Create config with extend option
    const configPath = path.join(dir, 'tailwind.config.js');
    const configContent = `
import colorModifiers from "${pluginPath}";

export default {
  content: ["./content.html"],
  theme: {
    colors: {
      "primary": "#3b82f6",
      "red-500": "#ef4444",
      "blue-500": "#3b82f6",
    },
  },
  plugins: [colorModifiers({ 
    warn: true,
    extend: ${JSON.stringify(extend)}
  })],
};
`;
    await writeFile(configPath, configContent, 'utf8');

    // 3) Tailwind input CSS with custom utility definitions
    const inputCssPath = path.join(dir, 'input.css');
    const inputCss = `
@import "${tailwindCssPath}";
@config "./tailwind.config.js";

@utility shimmer-from-* {
  --shimmer-color-1: --value(--color-*);
}

@utility shimmer-to-* {
  --shimmer-color-2: --value(--color-*);
}
`;
    await writeFile(inputCssPath, inputCss, 'utf8');

    // 4) Run PostCSS + Tailwind
    const result = await postcss([tailwind()]).process(inputCss, {
      from: inputCssPath,
    });

    return result.css;
  }

  it('generates custom utility with modifier', async () => {
    const css = await buildCssWithExtend(
      `<div class="shimmer-from-primary/l20"></div>`,
      { 'shimmer-from': '--shimmer-color-1' },
    );

    // Should generate --shimmer-color-1 with oklch modification
    expect(css).toContain('--shimmer-color-1:');
    expect(css).toContain('oklch(from');
    expect(css).toContain('calc(L + 0.2)');
  });

  it('handles base custom utility without modifier', async () => {
    const css = await buildCssWithExtend(
      `<div class="shimmer-from-primary"></div>`,
      { 'shimmer-from': '--shimmer-color-1' },
    );

    // Base utility should be handled by @utility definition
    // Should contain --shimmer-color-1 (from @utility, may be var() or resolved value)
    expect(css).toContain('--shimmer-color-1:');

    // Should NOT contain oklch(from for the base utility
    const shimmerFromPrimaryMatch = css.match(
      /\.shimmer-from-primary\s*\{[^}]+\}/,
    );
    expect(shimmerFromPrimaryMatch).toBeTruthy();
    if (shimmerFromPrimaryMatch) {
      expect(shimmerFromPrimaryMatch[0]).not.toContain('oklch(from');
    }
  });

  it('supports multiple custom utilities', async () => {
    const css = await buildCssWithExtend(
      `<div class="shimmer-from-blue-500/l20 shimmer-to-red-500/l-10"></div>`,
      {
        'shimmer-from': '--shimmer-color-1',
        'shimmer-to': '--shimmer-color-2',
      },
    );

    // Should generate both custom variables
    expect(css).toContain('--shimmer-color-1:');
    expect(css).toContain('--shimmer-color-2:');

    // Both should use oklch modifications
    expect(css).toContain('calc(L + 0.2)');
    expect(css).toContain('calc(L - 0.1)');
  });

  it('supports complex modifiers on custom utilities', async () => {
    const css = await buildCssWithExtend(
      `<div class="shimmer-from-primary/[l20_c-5_h30]"></div>`,
      { 'shimmer-from': '--shimmer-color-1' },
    );

    expect(css).toContain('--shimmer-color-1:');
    expect(css).toContain('calc(L + 0.2)');
    expect(css).toContain('calc(C - 0.05)');
    expect(css).toContain('calc(h + 30)');
  });

  it('works alongside built-in utilities', async () => {
    const css = await buildCssWithExtend(
      `<div class="bg-primary/l10 shimmer-from-primary/l20"></div>`,
      { 'shimmer-from': '--shimmer-color-1' },
    );

    // Built-in bg utility should still work
    expect(css).toContain('background-color:');
    expect(css).toContain('calc(L + 0.1)');

    // Custom utility should also work
    expect(css).toContain('--shimmer-color-1:');
    expect(css).toContain('calc(L + 0.2)');
  });
});
