import { argv, version, platform, arch } from 'node:process';
import { loadPlugin } from './plugin-loader.js';

async function main(): Promise<void> {
  console.log('Leonardo v0.1.0');
  console.log(`Node.js ${version} on ${platform}-${arch}`);
  console.log(`Args: ${argv.slice(2).join(' ') || '(none)'}`);

  // --- Plugin loading test ---
  console.log('\n=== Plugin loader test ===');

  try {
    const plugin = await loadPlugin('hello');

    console.log(`Loaded plugin: ${plugin.name} v${plugin.version}`);

    // Test data access
    const greeting = plugin.greet('Leonardo');
    console.log(`greet("Leonardo") → ${greeting}`);

    // Test function call
    const sum = plugin.add(40, 2);
    console.log(`add(40, 2) → ${sum}`);

    // Validate results
    const pass = greeting.includes('Hello, Leonardo') && sum === 42;
    console.log(`\nResult: ${pass ? '✅ PASS' : '❌ FAIL'}`);

    if (!pass) process.exitCode = 1;
  } catch (err) {
    console.error('Plugin load failed:', err);
    process.exitCode = 1;
  }

  // --- Builtins stress test ---
  console.log('\n=== Node.js builtins stress test ===');

  try {
    const stress = await loadPlugin('stress-builtins');
    if ('runTests' in stress && typeof stress.runTests === 'function') {
      const results = await (
        stress as unknown as {
          runTests: () => Promise<
            { name: string; pass: boolean; result?: string; error?: string }[]
          >;
        }
      ).runTests();

      const passed = results.filter((r) => r.pass).length;
      const failed = results.filter((r) => !r.pass);

      for (const r of results) {
        console.log(
          `  ${r.pass ? '✓' : '✗'} ${r.name}: ${r.result ?? r.error}`,
        );
      }

      console.log(`\n${passed}/${results.length} passed`);
      if (failed.length) {
        console.log('FAILURES:');
        for (const f of failed) {
          console.log(`  ✗ ${f.name}: ${f.error}`);
        }
        process.exitCode = 1;
      } else {
        console.log('✅ All builtins work');
      }
    }
  } catch (err) {
    console.error('Stress test load failed:', err);
    process.exitCode = 1;
  }
}

main();
