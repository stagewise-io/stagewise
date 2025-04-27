import { createContext, useContext } from "preact/compat";

interface ExtensionContextType {
  isExtensionInstalled: boolean;
  extensionVersion: string | null;
}

const ExtensionContext = createContext<ExtensionContextType>({
  isExtensionInstalled: false,
  extensionVersion: null,
});

export function ExtensionInteropProvider({ children }: { children: any }) {
  return (
    <ExtensionContext.Provider
      value={{ isExtensionInstalled: false, extensionVersion: null }}
    >
      {children}
    </ExtensionContext.Provider>
  );
}

export function useExtension() {
  return useContext(ExtensionContext);
}
