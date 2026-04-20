/** @type {import('../src/plugin-loader.ts').Plugin} */
const plugin = {
  name: 'hello',
  version: '1.0.0',

  greet(who) {
    return `Hello, ${who}! 👋 (from hello plugin v${this.version})`;
  },

  add(a, b) {
    return a + b;
  },
};

export default plugin;
