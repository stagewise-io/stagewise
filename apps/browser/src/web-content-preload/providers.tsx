import { KartonProvider } from './hooks/karton';
import { ContextElementProvider } from './hooks/cdp-interop';
import type { ReactNode } from 'react';

export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <KartonProvider>
      <ContextElementProvider>{children}</ContextElementProvider>
    </KartonProvider>
  );
};
