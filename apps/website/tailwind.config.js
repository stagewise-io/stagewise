import colorModifiers from '@stagewise/tailwindcss-color-modifiers';
import typography from '@tailwindcss/typography';

export default {
  plugins: [
    typography,
    colorModifiers({
      extend: {
        'shimmer-from': '--shimmer-color-1',
        'shimmer-to': '--shimmer-color-2',
      },
    }),
  ],
};
