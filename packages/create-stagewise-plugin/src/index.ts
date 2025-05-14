import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';
import mri from 'mri';
import * as prompts from '@clack/prompts';
import colors from 'picocolors';

const { yellow } = colors;
const argv = mri(process.argv.slice(2), {
  alias: { h: 'help' },
  boolean: ['help', 'overwrite'],
});
const cwd = process.cwd();
const defaultTargetDir = 'stagewise-plugin';

const helpMessage = `\
Usage: create-stagewise-plugin [OPTION]... [DIRECTORY]

Create a new Stagewise plugin in TypeScript.

Options:
  -h, --help         show this help message
  --overwrite        overwrite existing directory
`;

async function init() {
  if (argv.help) {
    console.log(helpMessage);
    return;
  }

  // 1. Determine target directory
  let targetDir = argv._[0] ? argv._[0].trim() : undefined;
  if (!targetDir) {
    const projectName = await prompts.text({
      message: 'Plugin name:',
      placeholder: defaultTargetDir,
      defaultValue: defaultTargetDir,
    });
    if (prompts.isCancel(projectName)) return prompts.cancel();
    targetDir = projectName.trim();
  }

  // 2. Handle existing directory
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    const overwrite = argv.overwrite
      ? 'yes'
      : await prompts.confirm({
          message: `Directory \"${targetDir}\" exists. Overwrite?`,
        });
    if (!overwrite) return prompts.cancel();
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // 3. Prepare directory
  const root = path.join(cwd, targetDir);
  fs.mkdirSync(root, { recursive: true });

  // 4. Scaffold using single template
  prompts.log.step(`Scaffolding project in ${root}...`);
  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../..',
    'template-basic',
  );

  copyDir(templateDir, root);

  // 5. Update package.json
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.name = path.basename(root);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // 6. Install & finish
  prompts.log.step('Installing dependencies...');
  const manager = detectPackageManager();
  spawn.sync(manager, ['install'], { cwd: root, stdio: 'inherit' });

  prompts.outro(`
Done. Next steps:
  cd ${targetDir}
  ${manager} run dev
`);
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function detectPackageManager() {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('pnpm')) return 'pnpm';
  return 'npm';
}

init().catch((e) => console.error(e));
