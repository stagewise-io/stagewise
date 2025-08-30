import { ToolbarButton } from './components/button.js';
import { ToolbarSection } from './components/section.js';
import { Glassy } from '@/components/ui/glassy';
import { useAppState } from '@/hooks/use-app-state';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { cn } from '@/utils';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { RegularContent } from './contents/regular.js';
import { Button } from '@headlessui/react';
import { Logo } from '@/components/ui/logo';
import { AnimatedGradientBackground } from '@/components/ui/animated-gradient-background';

export function Toolbar({
  draggableHandleRef,
  position,
  isDragged,
}: {
  draggableHandleRef: React.Ref<HTMLDivElement>;
  position: {
    isTopHalf: boolean;
    isLeftHalf: boolean;
  };
  isDragged: boolean;
}) {
  const { minimized, minimize, expand } = useAppState();
  const { isInitialLoad } = useAgents();

  return (
    <Glassy
      as="div"
      className={cn(
        'pointer-events-auto absolute z-10 origin-center rounded-full p-0.5 shadow-md transition-transform duration-500 ease-spring',
        minimized || isInitialLoad ? 'size-10 bg-blue-950/80' : 'size-auto',
        isDragged &&
          'scale-110 bg-sky-100/60 shadow-lg shadow-sky-500/10 blur-[0.2px]',
        '[--active-secondary:var(--color-blue-100)] [--active:var(--color-blue-600)] [--primary:var(--color-zinc-950)] [--secondary:var(--color-zinc-400)]',
        'stroke-[var(--primary)] text-[var(--primary)]',
      )}
      ref={draggableHandleRef}
    >
      {/* Minimized state button */}
      <Button
        onClick={() => expand()}
        className={cn(
          'absolute left-0 z-50 flex size-10 origin-center cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-500/20 transition-all duration-500 ease-spring hover:opacity-90',
          minimized || isInitialLoad
            ? 'pointer-events-auto scale-100 opacity-100 blur-none'
            : 'pointer-events-none scale-25 opacity-0 blur-md',
          position.isTopHalf ? 'top-0' : 'bottom-0',
        )}
      >
        <AnimatedGradientBackground className="-z-10 absolute inset-0 size-full" />
        <Logo color="white" className="mr-px mb-px size-1/2 shadow-2xs" />
      </Button>

      <div
        className={cn(
          'flex h-[calc-size(auto,size)] scale-100 items-center justify-center divide-y divide-border/20 transition-all duration-500 ease-spring',
          position.isTopHalf
            ? 'origin-top flex-col-reverse divide-y-reverse'
            : 'origin-bottom flex-col',
          (minimized || isInitialLoad) &&
            'pointer-events-none h-0 scale-50 opacity-0 blur-md',
        )}
      >
        <RegularContent />

        {/* Minimize button - always present */}
        <ToolbarSection>
          <ToolbarButton
            onClick={minimize}
            className={cn(
              'h-5',
              position.isTopHalf
                ? 'rounded-t-3xl rounded-b-lg'
                : 'rounded-t-lg rounded-b-3xl',
            )}
          >
            {position.isTopHalf ? (
              <ChevronUpIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
          </ToolbarButton>
        </ToolbarSection>
      </div>
    </Glassy>
  );
}
