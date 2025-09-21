/**
 * Set of allowed file extensions for code analysis and indexing.
 * Extensions are stored without the leading dot for easier glob pattern construction.
 */
export const ALLOWED_EXTENSIONS = new Set([
  // Core Web Technologies
  'html',
  'htm',
  'css',
  'js',
  'mjs', // ES Modules
  'cjs', // CommonJS Modules

  // JavaScript Supersets & Compilers
  'ts',
  'tsx', // TypeScript with JSX
  'jsx', // JavaScript with JSX
  'coffee',
  'elm',
  'purs', // PureScript
  'res', // ReScript

  // Component-Based Frameworks
  'vue', // Vue.js
  'svelte', // Svelte
  'astro', // Astro

  // CSS Preprocessors & Extensions
  'scss', // Sass
  'sass', // Sass (indented syntax)
  'less', // Less
  'styl', // Stylus

  // Templating & Markup
  'pug',
  'jade', // Old Pug
  'hbs', // Handlebars
  'handlebars',
  'ejs', // Embedded JavaScript
  'mustache',
  'liquid',
  'njk', // Nunjucks
  'slim',
  'md', // Markdown
  'mdx', // Markdown with JSX
]);

/**
 * Set of specific filenames (including dotfiles) to index.
 * These are files that don't have standard extensions and wouldn't be caught
 * by the extension-based patterns.
 */
export const ALLOWED_FILENAMES = new Set([
  // Dotfiles without extensions
  '.babelrc',
  '.browserslistrc',
  '.eslintrc',
  '.eslintignore',
  '.prettierrc',
  '.prettierignore',
  '.stylelintrc',
  '.postcssrc',
  '.swcrc',
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.nvmrc',
  '.yarnrc',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',

  // Files without extensions
  'Dockerfile',
  'Makefile',
  'LICENSE',
  'CODEOWNERS',
  'Procfile',
  'Gemfile',
  'Rakefile',
  'Vagrantfile',

  // Package managers & dependency files
  'package.json',
  'composer.json', // PHP
  'bower.json', // Legacy but still used
  'deno.json', // Deno
  'deno.jsonc', // Deno with comments

  // TypeScript & JavaScript configuration
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tsconfig.server.json',
  'tsconfig.spec.json',
  'tsconfig.lib.json',
  'tsconfig.build.json',
  'tsconfig.test.json',
  'tsconfig.e2e.json',
  'jsconfig.json',

  // Linting & Formatting (JSON versions)
  '.eslintrc.json',
  '.prettierrc.json',
  '.stylelintrc.json',
  '.babelrc.json',
  'babel.config.json',

  // Testing frameworks
  'jest.config.json',
  'vitest.config.json',
  'karma.conf.json',
  'cypress.json',
  'playwright.config.json',
  '.mocharc.json',

  // Framework-specific configurations
  'angular.json', // Angular
  'nx.json', // Nx monorepos
  'vue.config.json', // Vue
  'nuxt.config.json', // Nuxt
  'ember-cli-build.json', // Ember
  'app.json', // React Native/Expo/Heroku

  // Build tools & Monorepo configs
  'turbo.json', // Turborepo
  'lerna.json', // Lerna
  'rush.json', // Rush
  'webpack.config.json', // Rare but exists
  'rollup.config.json', // Rare but exists
  '.swcrc.json', // SWC compiler
  'pnpm-workspace.yaml', // PNPM

  // Cloud & Deployment platforms
  'vercel.json',
  'netlify.json',
  'firebase.json',
  'now.json', // Legacy Vercel
  'serverless.json',
  'render.json',
  'railway.json',
  'fly.json',

  // IDE/Editor configurations (often in subdirectories)
  'settings.json', // VS Code
  'launch.json', // VS Code
  'tasks.json', // VS Code
  'extensions.json', // VS Code
  'devcontainer.json', // VS Code Dev Containers
  '.devcontainer.json',

  // Web Standards & PWA
  'manifest.json', // PWA, browser extensions
  'manifest.webmanifest',
  '.webmanifest',

  // CI/CD & Automation
  'renovate.json', // Dependency updates
  '.renovaterc.json',
  '.releaserc.json', // semantic-release
  '.ncurc.json', // npm-check-updates
  '.nycrc.json', // NYC code coverage
  '.c8rc.json', // C8 code coverage
  'codecov.json',
  '.circleci/config.json', // CircleCI (rare, usually YAML)

  // Other development tools
  'nodemon.json',
  'pm2.json',
  'ecosystem.config.json', // PM2
  '.watchmanconfig', // Watchman
  'apollo.config.json', // Apollo GraphQL
  '.graphqlrc.json', // GraphQL
  'ormconfig.json', // TypeORM
  'nest-cli.json', // NestJS
  '.sequelizerc.json', // Sequelize
  'contentlayer.config.json', // Contentlayer
  '.changeset/config.json', // Changesets
]);
