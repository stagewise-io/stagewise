import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';

import type { ComponentChildren } from 'preact';

interface SessionContextType {
  sessionId: string | undefined;
  setSessionId: (sessionId: string | undefined) => void;
}

const SessionContext = createContext<SessionContextType>({
  sessionId: undefined,
  setSessionId: () => {},
});

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  return (
    <SessionContext.Provider value={{ sessionId, setSessionId }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): string | undefined {
  return useContext(SessionContext).sessionId;
}

export function useSessionManager() {
  return useContext(SessionContext);
}
