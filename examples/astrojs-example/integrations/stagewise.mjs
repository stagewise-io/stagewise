/**
 * Astro integration for Stagewise Toolbar
 * Injects the toolbar into all pages during development
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.config - Custom Stagewise configuration
 */

export default function stagewiseIntegration(options = {}) {
  // Default configuration
  const defaultConfig = {
    plugins: [],
  };

  // Merge user config with default config
  const config = options.config
    ? { ...defaultConfig, ...options.config }
    : defaultConfig;
  return {
    name: "stagewise-toolbar",
    hooks: {
      "astro:config:setup": ({ command, injectScript }) => {
        // Only inject in development mode
        if (command === "dev") {
          // Inject the toolbar initialization script
          injectScript(
            "page",
            `
            // Stagewise Toolbar Integration for Astro
            (function() {
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initStagewise);
              } else {
                initStagewise();
              }

              async function initStagewise() {
                try {
                  const { initToolbar } = await import('@stagewise/toolbar');
                  const stagewiseConfig = ${JSON.stringify(config, null, 20)};
                  initToolbar(stagewiseConfig);
                  console.log('Stagewise Toolbar initialized for Astro page');
                } catch (error) {
                  console.warn('Stagewise Failed to initialize toolbar:', error);
                }
              }
            })();
            // End of Stagewise Toolbar Integration for Astro
          `,
          );
        }
      },
    },
  };
}
