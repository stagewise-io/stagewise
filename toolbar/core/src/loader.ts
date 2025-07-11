import type {
  ToolbarConfig as InternalToolbarConfig,
  ToolbarPluginLoader,
} from '@/config';
export type * from '@/plugin';

export interface ToolbarConfig extends Omit<InternalToolbarConfig, 'plugins'> {
  plugins?: ToolbarPluginLoader[];
}

declare global {
  interface Window {
    stagewiseConfig?: ToolbarConfig;
  }
}

export function initToolbar(config: ToolbarConfig = {}) {
  // We check if we're in a non-browser environment and prevent the execution if that is the case
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    console.warn(
      'Stagewise Toolbar is not supported in non-browser environments.',
    );
    return;
  }

  if (document.querySelector('stagewise-toolbar')) {
    // If the toolbar is already loaded, don't load another instance
    console.warn('Stagewise Toolbar is already loaded - aborting init.');
    return;
  }

  const wrapper = document.createElement('stagewise-toolbar');
  wrapper.style.display = 'block';
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '0';
  wrapper.style.right = '0';
  wrapper.style.bottom = '0';
  wrapper.style.width = '100vw';
  wrapper.style.height = '100vh';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.pointerEvents = 'none';

  const iframe = document.createElement('iframe');
  iframe.style.display = 'block';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.margin = '0';
  iframe.style.padding = '0';
  iframe.style.width = '100vw';
  iframe.style.height = '100vh';
  iframe.style.backgroundColor = 'transparent';
  iframe.style.pointerEvents = 'none';
  iframe.style.colorScheme = 'normal';
  iframe.sandbox.add('allow-same-origin');
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-presentation');
  iframe.sandbox.add('allow-pointer-lock');
  iframe.sandbox.add('allow-popups');
  iframe.setAttribute('allowtransparency', 'true');

  iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="preconnect" href="https://rsms.me/"><link rel="stylesheet" href="https://rsms.me/inter/inter.css"></head><body style="pointer-events: none;"></body></html>`;

  // We're injecting the script into the iframe as soon as the base document is loaded.
  iframe.addEventListener('load', () => {
    // Configure the proxy object that handles interactivity tracking
    let lastMouseOverInteractiveAreaState = false;
    const handleMouseMove = (e: MouseEvent) => {
      const elementAtPoint = iframe.contentDocument.elementFromPoint(
        e.clientX,
        e.clientY,
      );

      // Check if the element is clickable (has click event handlers, is a button, link, etc.)
      const isInteractive =
        elementAtPoint &&
        elementAtPoint !== document.body &&
        elementAtPoint.tagName !== 'HTML';

      if (isInteractive !== lastMouseOverInteractiveAreaState) {
        iframe.style.pointerEvents = isInteractive ? 'auto' : 'none';
        lastMouseOverInteractiveAreaState = isInteractive;
      }
    };

    // Start watching for mouse moves in the main app realm and the toolbar realm.
    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    iframe.contentWindow.addEventListener('mousemove', handleMouseMove, {
      capture: true,
    });

    const devSuffix = import.meta.env.MODE === 'development' ? '?dev' : '';

    // we add the main modules to the importmap. In order to add them, we convert every entries value into a base64 encoded dataUri.
    const main_modules = Object.fromEntries(
      Object.entries(__MAIN_MODULES__).map(([key, value]) => {
        return [
          key,
          URL.createObjectURL(new Blob([value], { type: 'text/javascript' })),
        ];
      }),
    );
    main_modules['@stagewise/toolbar/plugin-ui'] = URL.createObjectURL(
      new Blob(["export * from 'plugin-ui.js'"], { type: 'text/javascript' }),
    );

    if (config.plugins) {
      // We create a new importmap module for every plugin that was passed into the config.
      for (const [index, plugin] of config.plugins.entries()) {
        const plugin_module = URL.createObjectURL(
          new Blob([plugin.mainPlugin], { type: 'text/javascript' }),
        );
        main_modules[`plugin-entry-${index}`] = plugin_module;
      }
    }

    // We create one config module on the fly which represents the actual internal config of the toolbar.
    const config_module = URL.createObjectURL(
      new Blob([getConfigModuleContent(config)], { type: 'text/javascript' }),
    );
    main_modules['@stagewise/toolbar/config'] = config_module;

    const imports = {
      react: `https://esm.sh/react@19.1.0${devSuffix}`,
      'react-dom': `https://esm.sh/react-dom@19.1.0${devSuffix}`,
      'react-dom/client': `https://esm.sh/react-dom@19.1.0/client${devSuffix}`,
      'react/jsx-runtime': `https://esm.sh/react@19.1.0/jsx-runtime${devSuffix}`,
      ...main_modules,
    };

    // Load the main app into the iframe.
    const importmapScript = iframe.contentDocument.createElement('script');
    importmapScript.type = 'importmap';
    importmapScript.textContent = `{"imports":${JSON.stringify(imports)}}`;
    iframe.contentDocument.head.appendChild(importmapScript);

    // After adding the importmap to the iframe, we now need to make sure that the main app is loaded.
    // We do so by dynamically triggering an import of the main app, since it will start initializing itself after import.
    const script = iframe.contentDocument.createElement('script');
    script.type = 'module';
    script.textContent = `import('index.js');`;
    iframe.contentDocument.head.appendChild(script);
  });

  wrapper.appendChild(iframe);
  document.body.appendChild(wrapper);
}

function getConfigModuleContent(config: ToolbarConfig) {
  const pluginImports =
    config.plugins
      ?.map((_, index) => `import plugin${index} from 'plugin-entry-${index}'`)
      .join('\n') ?? '';

  // We make an array out of the imported plugins.
  const convertedPluginArray = `[${config.plugins?.map((_, index) => `plugin${index}`).join(',') ?? ''}]`;

  const convertedConfig = {
    ...config,
    plugins: '__PLUGIN_PLACEHOLDER__',
  };

  let configString = JSON.stringify(convertedConfig);
  configString = configString.replace(
    '"__PLUGIN_PLACEHOLDER__"',
    convertedPluginArray,
  );

  return `${pluginImports}

const config = ${configString};

export default config;
`;
}
