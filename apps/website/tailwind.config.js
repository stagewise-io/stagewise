import colorModifiers from '@stagewise/tailwindcss-color-modifiers';

export default {
  plugins: [
    colorModifiers({
      extend: {
        'shimmer-from': '--shimmer-color-1',
        'shimmer-to': '--shimmer-color-2',
      },
    }),
  ],
};
