import { useWindowSize } from '@/hooks/use-window-size';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useCallback, useRef } from 'preact/hooks';
import type { HTMLAttributes } from 'preact/compat';
import { Trash2 } from 'lucide-react';
import { useChatState } from '@/hooks/use-chat-state';
import type { ContextElementContext } from '@/plugin';
import { usePlugins } from '@/hooks/use-plugins';

export interface ContextItemProps extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
  pluginContext: {
    pluginName: string;
    context: ContextElementContext;
  }[];
}

export function ContextItem({ refElement, ...props }: ContextItemProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  const windowSize = useWindowSize();

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current) {
      if (refElement) {
        const referenceRect = refElement.getBoundingClientRect();

        boxRef.current.style.top = `${referenceRect.top}px`;
        boxRef.current.style.left = `${referenceRect.left}px`;
        boxRef.current.style.width = `${referenceRect.width}px`;
        boxRef.current.style.height = `${referenceRect.height}px`;
        boxRef.current.style.display = undefined;
      } else {
        boxRef.current.style.height = '0px';
        boxRef.current.style.width = '0px';
        boxRef.current.style.top = `${windowSize.height / 2}px`;
        boxRef.current.style.left = `${windowSize.width / 2}px`;
        boxRef.current.style.display = 'none';
      }
    }
  }, [refElement, windowSize.height, windowSize.width]);

  useCyclicUpdate(updateBoxPosition, 30);

  const chatState = useChatState();

  const handleDeleteClick = useCallback(() => {
    chatState.removeChatDomContext(chatState.currentChatId, refElement);
  }, [chatState, refElement]);

  const { plugins } = usePlugins();

  return (
    <div
      {...props}
      className={
        'pointer-events-auto fixed flex cursor-pointer items-center justify-center rounded-lg border-2 border-green-600/80 bg-green-600/5 text-transparent transition-all duration-0 hover:border-red-600/80 hover:bg-red-600/20 hover:text-white'
      }
      ref={boxRef}
      onClick={handleDeleteClick}
      role="button"
      tabIndex={0}
    >
      <div className="absolute top-0.5 left-0.5 flex w-full flex-row items-start justify-start gap-1">
        <div className="flex flex-row items-center justify-center gap-0.5 overflow-hidden rounded-md bg-zinc-700/80 px-1 py-0 font-medium text-white text-xs">
          <span className="truncate">{refElement.tagName.toLowerCase()}</span>
        </div>
        {props.pluginContext
          .filter((plugin) => plugin.context.annotation)
          .map((plugin) => (
            <div className="flex flex-row items-center justify-center gap-0.5 overflow-hidden rounded-md bg-zinc-700/80 px-1 py-0 font-medium text-white text-xs">
              <span className="size-3 shrink-0 stroke-white text-white *:size-full">
                {
                  plugins.find((p) => p.pluginName === plugin.pluginName)
                    ?.iconSvg
                }
              </span>
              <span className="truncate">{plugin.context.annotation}</span>
            </div>
          ))}
      </div>
      <Trash2 className="size-6 drop-shadow-black drop-shadow-md" />
    </div>
  );
}
