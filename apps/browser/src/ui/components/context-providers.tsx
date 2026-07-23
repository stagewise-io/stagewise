import type { ReactNode } from 'react';
import { KartonProvider } from '@ui/hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { PostHogProvider } from '@ui/hooks/use-posthog';
import { TabStateUIProvider } from '../hooks/use-tab-ui-state';
import { ErrorBoundary } from './error-boundary';
import { TutorialProvider } from '@ui/contexts/tutorial';
import { PersonalizationThemeSyncer } from './personalization-theme-syncer';
import { useAnimationIdleGate } from '@ui/hooks/use-animation-idle-gate';

export function ContextProviders({ children }: { children?: ReactNode }) {
  useAnimationIdleGate();
  return (
    <TooltipProvider>
      <KartonProvider>
        <PostHogProvider>
          <ErrorBoundary>
            <TutorialProvider>
              <TabStateUIProvider>
                <PersonalizationThemeSyncer />
                {children}
              </TabStateUIProvider>
            </TutorialProvider>
          </ErrorBoundary>
        </PostHogProvider>
      </KartonProvider>
    </TooltipProvider>
  );
}
