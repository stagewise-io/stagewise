import { KartonProvider } from './hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { ThemeSyncer } from './theme-syncer';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <KartonProvider>
        <ThemeSyncer />
        {children}
      </KartonProvider>
    </TooltipProvider>
  );
}
