import type { ComponentType } from 'react';
import {
  FileIcon,
  FileCode2,
  FileText,
  FileTerminal,
  FolderIcon,
} from 'lucide-react';
import {
  SiTypescript,
  SiJavascript,
  SiReact,
  SiVuedotjs,
  SiAngular,
  SiSvelte,
  SiPython,
  SiGo,
  SiRust,
  SiCplusplus,
  SiC,
  SiSharp,
  SiPhp,
  SiRuby,
  SiSwift,
  SiKotlin,
  SiDart,
  SiHtml5,
  SiCss3,
  SiSass,
  SiLess,
  SiTailwindcss,
  SiNodedotjs,
  SiDeno,
  SiBun,
  SiDocker,
  SiGit,
  SiMarkdown,
  SiJson,
  SiYaml,
  SiToml,
  SiGraphql,
  SiPostgresql,
  SiMongodb,
  SiRedis,
  SiNginx,
  SiApache,
  SiWebpack,
  SiVite,
  SiEsbuild,
  SiJest,
  SiVitest,
  SiCypress,
  SiEslint,
  SiPrettier,
} from 'react-icons/si';

export interface FileIconData {
  Icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
}

/**
 * Get the appropriate icon and color for a file based on its name/extension
 * @param filename - The name of the file
 * @returns An object containing the Icon component and optional color
 */
export function getFileIcon(filename: string): FileIconData {
  // Handle folders
  if (filename.endsWith('/')) {
    return { Icon: FolderIcon };
  }

  // Get file extension
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const filenameLower = filename.toLowerCase();

  // Check for specific filenames first
  const specificFiles: Record<string, FileIconData> = {
    'package.json': { Icon: SiNodedotjs, color: '#339933' },
    'tsconfig.json': { Icon: SiTypescript, color: '#3178c6' },
    'angular.json': { Icon: SiAngular, color: '#dd0031' },
    '.angular': { Icon: SiAngular, color: '#dd0031' },
    'vite.config.ts': { Icon: SiVite, color: '#646cff' },
    'vite.config.js': { Icon: SiVite, color: '#646cff' },
    'vite.config.mjs': { Icon: SiVite, color: '#646cff' },
    'webpack.config.js': { Icon: SiWebpack, color: '#8dd6f9' },
    'rollup.config.js': { Icon: FileCode2 },
    'rollup.config.ts': { Icon: FileCode2 },
    'esbuild.config.js': { Icon: SiEsbuild, color: '#ffcf00' },
    '.eslintrc': { Icon: SiEslint, color: '#4b32c3' },
    '.eslintrc.js': { Icon: SiEslint, color: '#4b32c3' },
    '.eslintrc.json': { Icon: SiEslint, color: '#4b32c3' },
    '.prettierrc': { Icon: SiPrettier, color: '#f7b93e' },
    '.prettierrc.js': { Icon: SiPrettier, color: '#f7b93e' },
    '.prettierrc.json': { Icon: SiPrettier, color: '#f7b93e' },
    dockerfile: { Icon: SiDocker, color: '#2496ed' },
    '.gitignore': { Icon: SiGit, color: '#f05032' },
    '.gitattributes': { Icon: SiGit, color: '#f05032' },
    'readme.md': { Icon: SiMarkdown, color: '#000000' },
    'changelog.md': { Icon: SiMarkdown, color: '#000000' },
    'jest.config.js': { Icon: SiJest, color: '#c21325' },
    'jest.config.ts': { Icon: SiJest, color: '#c21325' },
    'vitest.config.ts': { Icon: SiVitest, color: '#6e9f18' },
    'vitest.config.js': { Icon: SiVitest, color: '#6e9f18' },
    'cypress.config.js': { Icon: SiCypress, color: '#17202c' },
    'cypress.config.ts': { Icon: SiCypress, color: '#17202c' },
    'playwright.config.ts': { Icon: FileCode2 },
    'playwright.config.js': { Icon: FileCode2 },
    'tailwind.config.js': { Icon: SiTailwindcss, color: '#06b6d4' },
    'tailwind.config.ts': { Icon: SiTailwindcss, color: '#06b6d4' },
    'deno.json': { Icon: SiDeno, color: '#000000' },
    'deno.jsonc': { Icon: SiDeno, color: '#000000' },
    'bun.lockb': { Icon: SiBun, color: '#000000' },
    'docker-compose.yml': { Icon: SiDocker, color: '#2496ed' },
    'docker-compose.yaml': { Icon: SiDocker, color: '#2496ed' },
    'nginx.conf': { Icon: SiNginx, color: '#009639' },
    'httpd.conf': { Icon: SiApache, color: '#d22128' },
    '.htaccess': { Icon: SiApache, color: '#d22128' },
  };

  const specificFile = specificFiles[filenameLower];
  if (specificFile) {
    return specificFile;
  }

  // Check for Angular-specific patterns
  const angularPatterns = [
    '.component.ts',
    '.component.js',
    '.module.ts',
    '.module.js',
    '.service.ts',
    '.service.js',
    '.directive.ts',
    '.directive.js',
    '.pipe.ts',
    '.pipe.js',
    '.guard.ts',
    '.guard.js',
    '.interceptor.ts',
    '.interceptor.js',
    '.resolver.ts',
    '.resolver.js',
  ];

  for (const pattern of angularPatterns) {
    if (filenameLower.endsWith(pattern)) {
      return { Icon: SiAngular, color: '#dd0031' };
    }
  }

  // Map extensions to icons
  const extensionMap: Record<string, FileIconData> = {
    // TypeScript/JavaScript
    ts: { Icon: SiTypescript, color: '#3178c6' },
    tsx: { Icon: SiReact, color: '#61dafb' },
    js: { Icon: SiJavascript, color: '#f7df1e' },
    jsx: { Icon: SiReact, color: '#61dafb' },
    mjs: { Icon: SiJavascript, color: '#f7df1e' },
    cjs: { Icon: SiNodedotjs, color: '#339933' },

    // Frameworks
    vue: { Icon: SiVuedotjs, color: '#4fc08d' },
    svelte: { Icon: SiSvelte, color: '#ff3e00' },

    // Languages
    py: { Icon: SiPython, color: '#3776ab' },
    java: { Icon: FileCode2 },
    go: { Icon: SiGo, color: '#00add8' },
    rs: { Icon: SiRust, color: '#000000' },
    cpp: { Icon: SiCplusplus, color: '#00599c' },
    cc: { Icon: SiCplusplus, color: '#00599c' },
    c: { Icon: SiC, color: '#a8b9cc' },
    h: { Icon: SiC, color: '#a8b9cc' },
    hpp: { Icon: SiCplusplus, color: '#00599c' },
    cs: { Icon: SiSharp, color: '#239120' },
    php: { Icon: SiPhp, color: '#777bb4' },
    rb: { Icon: SiRuby, color: '#cc342d' },
    swift: { Icon: SiSwift, color: '#fa7343' },
    kt: { Icon: SiKotlin, color: '#7f52ff' },
    dart: { Icon: SiDart, color: '#0175c2' },

    // Web
    html: { Icon: SiHtml5, color: '#e34c26' },
    htm: { Icon: SiHtml5, color: '#e34c26' },
    css: { Icon: SiCss3, color: '#1572b6' },
    scss: { Icon: SiSass, color: '#cc6699' },
    sass: { Icon: SiSass, color: '#cc6699' },
    less: { Icon: SiLess, color: '#1d365d' },

    // Data/Config
    json: { Icon: SiJson, color: '#000000' },
    jsonc: { Icon: SiJson, color: '#000000' },
    yaml: { Icon: SiYaml, color: '#cb171e' },
    yml: { Icon: SiYaml, color: '#cb171e' },
    toml: { Icon: SiToml, color: '#9c4221' },
    xml: { Icon: FileCode2 },
    graphql: { Icon: SiGraphql, color: '#e10098' },
    gql: { Icon: SiGraphql, color: '#e10098' },

    // Database
    sql: { Icon: SiPostgresql, color: '#336791' },
    mongodb: { Icon: SiMongodb, color: '#47a248' },
    redis: { Icon: SiRedis, color: '#dc382d' },

    // Docs
    md: { Icon: SiMarkdown, color: '#000000' },
    mdx: { Icon: SiMarkdown, color: '#000000' },
    txt: { Icon: FileText },
    pdf: { Icon: FileText },
    doc: { Icon: FileText },
    docx: { Icon: FileText },

    // Shell
    sh: { Icon: FileTerminal },
    bash: { Icon: FileTerminal },
    zsh: { Icon: FileTerminal },
    fish: { Icon: FileTerminal },
    ps1: { Icon: FileTerminal },
    bat: { Icon: FileTerminal },
    cmd: { Icon: FileTerminal },

    // Other
    env: { Icon: FileCode2 },
    lock: { Icon: FileCode2 },
    log: { Icon: FileText },
    gitignore: { Icon: SiGit, color: '#f05032' },
  };

  return extensionMap[ext] || { Icon: FileIcon };
}

/**
 * Helper function to check if a file has a specific programming language extension
 */
export function isProgrammingFile(filename: string): boolean {
  const programmingExtensions = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'java',
    'go',
    'rs',
    'cpp',
    'c',
    'cs',
    'php',
    'rb',
    'swift',
    'kt',
    'dart',
    'vue',
    'svelte',
  ];

  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? programmingExtensions.includes(ext) : false;
}

/**
 * Get a color-safe version of the icon (for dark/light themes)
 */
export function getThemedFileIcon(
  filename: string,
  isDarkMode: boolean,
): FileIconData {
  const iconData = getFileIcon(filename);

  // Adjust colors for dark mode if needed
  if (isDarkMode && iconData.color === '#000000') {
    return { ...iconData, color: '#ffffff' };
  }

  return iconData;
}
