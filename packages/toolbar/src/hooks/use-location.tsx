import { type ComponentChildren, createContext } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { useCyclicUpdate } from "./use-cyclic-update";

const LocationContext = createContext<URL>(new URL(window.location.href));

export function LocationProvider({
  children,
}: {
  children?: ComponentChildren;
}) {
  const [currentUrl, setCurrentUrl] = useState<URL>(
    new URL(window.location.href)
  );

  const update = useCallback(() => {
    setCurrentUrl(new URL(window.location.href));
  }, []);

  // We sadly have to fetch all the time because there is no proper event that listens to all kinds of URL changes...
  useCyclicUpdate(update, 15);

  return (
    <LocationContext.Provider value={currentUrl}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
