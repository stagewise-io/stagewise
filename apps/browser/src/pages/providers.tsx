import { KartonProvider } from './hooks/use-karton';

export function Providers({ children }: { children: React.ReactNode }) {
  return <KartonProvider>{children}</KartonProvider>;
}
