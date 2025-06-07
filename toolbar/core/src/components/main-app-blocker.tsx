import { useAppState } from '@/hooks/use-app-state';
import { cn } from '@/utils';

// This component creates a transparent element that blocks all clicks on the elements below it.
export function MainAppBlocker() {
  const { isMainAppBlocked } = useAppState();

  return (
    <div
      className={cn(
        'fixed inset-0 h-screen w-screen',
        isMainAppBlocked ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      role="button"
      tabIndex={0}
    />
  );
}
