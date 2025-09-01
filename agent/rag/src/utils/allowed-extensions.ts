/**
 * Set of allowed file extensions for code analysis and indexing.
 * Includes web technologies, frameworks, preprocessors, and configuration files.
 */
export const ALLOWED_EXTENSIONS = new Set([
  // Core Web Technologies
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs', // ES Modules
  '.cjs', // CommonJS Modules

  // JavaScript Supersets & Compilers
  '.ts',
  '.tsx', // TypeScript with JSX
  '.jsx', // JavaScript with JSX
  '.coffee',
  '.elm',
  '.purs', // PureScript
  '.res', // ReScript

  // Component-Based Frameworks
  '.vue', // Vue.js
  '.svelte', // Svelte
  '.astro', // Astro
  '.solid', // SolidJS (conventionally uses .jsx/.tsx)

  // CSS Preprocessors & Extensions
  '.scss', // Sass
  '.sass', // Sass (indented syntax)
  '.less', // Less
  '.styl', // Stylus

  // Templating & Markup
  '.pug',
  '.jade', // Old Pug
  '.hbs', // Handlebars
  '.handlebars',
  '.ejs', // Embedded JavaScript
  '.mustache',
  '.liquid',
  '.njk', // Nunjucks
  '.slim',
  '.md', // Markdown
  '.mdx', // Markdown with JSX

  // Graphics & Data Formats
  '.svg',
  '.json',
  '.jsonc', // JSON with Comments
  '.yaml',
  '.yml',
  '.toml',
  '.graphql',
  '.gql',

  // Configuration Files (Critical for Context)
  '.babelrc',
  '.browserslistrc',
  '.eslintrc',
  '.eslintignore',
  '.prettierrc',
  '.prettierignore',
  '.stylelintrc',
  '.postcssrc',
  '.swcrc', // SWC Compiler
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'webpack.config.js',
  'vite.config.js',
  'vite.config.ts',
  'rollup.config.js',
  'next.config.js',
  'nuxt.config.js',
  'svelte.config.js',
  'remix.config.js',
  'astro.config.mjs',
  'tailwind.config.js',

  // Testing (Storybook, etc.)
  '.stories.js',
  '.stories.jsx',
  '.stories.ts',
  '.stories.tsx',
  '.story.js',
  '.test.js',
  '.spec.js',
  '.test.ts',
  '.spec.ts',
]);
