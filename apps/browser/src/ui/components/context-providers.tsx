import { MessageEditStateProvider } from '@ui/hooks/use-message-edit-state';
import type { ReactNode } from 'react';
import { KartonProvider } from '@ui/hooks/use-karton';
import { TooltipProvider } from '@stagewise/stage-ui/components/tooltip';
import { PostHogProvider } from '@ui/hooks/use-posthog';
import { TabStateUIProvider } from '../hooks/use-tab-ui-state';
import { ErrorBoundary } from './error-boundary';
import { TutorialProvider } from '@ui/contexts/tutorial';

export function ContextProviders({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider>
      <KartonProvider>
        <PostHogProvider>
          <ErrorBoundary>
            <TutorialProvider>
              <MessageEditStateProvider>
                <TabStateUIProvider>{children}</TabStateUIProvider>
              </MessageEditStateProvider>
            </TutorialProvider>
          </ErrorBoundary>
        </PostHogProvider>
      </KartonProvider>
    </TooltipProvider>
  );
}
