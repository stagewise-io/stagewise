import { createContext, useContext } from "preact/compat";

interface IndexedDBContextType {
  db: IDBDatabase | null;
  isReady: boolean;
}

const IndexedDBContext = createContext<IndexedDBContextType>({
  db: null,
  isReady: false,
});

export function IndexedDBProvider({ children }: { children: any }) {
  return (
    <IndexedDBContext.Provider value={{ db: null, isReady: false }}>
      {children}
    </IndexedDBContext.Provider>
  );
}

export function useSimpleIndexedDB() {
  return useContext(IndexedDBContext);
}
