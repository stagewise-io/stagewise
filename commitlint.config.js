module.exports = {
  extends: [
    '@commitlint/config-conventional',
    '@commitlint/config-pnpm-scopes',
  ],
  rules: {
    'scope-empty': [2, 'never'], // Mandatory scopes - must match a workspace package
    'body-max-line-length': [2, 'always', 2000],
  },
};
