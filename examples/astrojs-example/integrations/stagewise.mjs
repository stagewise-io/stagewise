/**
 * Astro integration for Stagewise Toolbar
 * Injects the toolbar into all pages during development
 *
 * @param {Object} customConfig - Custom Stagewise configuration
 */

const serializeValue = (obj) => {
  if (typeof obj === "function") {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(serializeValue).join(", ")}]`;
  }
  if (obj && typeof obj === "object") {
    const entries = Object.entries(obj).map(([key, value]) => {
      const serializedValue = serializeValue(value);
      return `${JSON.stringify(key)}: ${serializedValue}`;
    });
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(obj);
};

export default function stagewiseIntegration(customConfig = {}) {
  // Merge user config with default config
  const config = { plugins: [], ...customConfig };
  return {
    name: "stagewise-toolbar",
    hooks: {
      "astro:config:setup": ({ command, injectScript, updateConfig }) => {
        // Only inject in development mode
        if (command === "dev") {
          // Add virtual module plugin to serve the config via updateConfig
          updateConfig({
            vite: {
              plugins: [
                {
                  name: "stagewise-config-virtual",
                  resolveId(id) {
                    if (id === "/@stagewise-config") {
                      return id;
                    }
                  },
                  load(id) {
                    if (id === "/@stagewise-config") {
                      // Create a more robust serialization that preserves functions
                      return `export default ${serializeValue(config)};`;
                    }
                  },
                },
              ],
            },
          });

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
                  // Pass the config via import so functions survive
                  const { default: stagewiseConfig } = await import('/@stagewise-config');
                  initToolbar(stagewiseConfig);
                  console.log('Stagewise Toolbar initialized for Astro page');
                } catch (error) {
                  console.warn('Stagewise Failed to initialize toolbar:', error);
                }
              }
            })();
            // End of Stagewise Toolbar Integration for Astro
          `
          );
        }
      },
    },
  };
}
