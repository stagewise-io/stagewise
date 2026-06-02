let cachedVarNames: Set<string> | null = null;

export function collectThemeVariables(): Record<string, string> {
  if (!cachedVarNames) {
    cachedVarNames = new Set<string>();
    const computed = getComputedStyle(document.documentElement);
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      if (prop?.startsWith('--')) cachedVarNames.add(prop);
    }
  }

  const computed = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  cachedVarNames.forEach((name) => {
    const val = computed.getPropertyValue(name).trim();
    if (val) result[name] = val;
  });
  return result;
}

export function sendThemeToIframe(iframe: HTMLIFrameElement | null) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(
    { type: '__stagewise_theme', variables: collectThemeVariables() },
    '*',
  );
}
