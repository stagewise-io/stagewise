const prefixWhereOverrideList = ['html', 'body'];
const prefixElementOverrideList = [':root', ':host'];

export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
    'postcss-prefix-selector': {
      prefix: 'stagewise-companion-anchor',
      transform: (prefix, selector, prefixedSelector, filePath, rule) => {
        if (prefixWhereOverrideList.includes(selector)) {
          return `:where(${prefix})`;
        } else if (
          prefixElementOverrideList.some((sel) => selector.includes(sel))
        ) {
          const cleanedSelector = prefixElementOverrideList.reduce(
            (acc, sel) => {
              return acc.replace(sel, prefix);
            },
            selector,
          );
          return cleanedSelector;
        } else {
          return prefixedSelector;
        }
      },
    },
  },
};
