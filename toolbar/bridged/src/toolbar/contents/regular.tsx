import { ToolbarSection } from '@/toolbar/components/section';
import { ToolbarButton } from '@/toolbar/components/button';
import { MessageCircleIcon, PuzzleIcon } from 'lucide-react';
import { usePanels } from '@/hooks/use-panels';
import { usePlugins } from '@/hooks/use-plugins';
import { useChatState } from '@/hooks/use-chat-state';

export function RegularContent() {
  const {
    isChatOpen,
    openChat,
    closeChat,
    openPluginName,
    closePlugin,
    openPlugin,
  } = usePanels();

  const { startPromptCreation, startContextSelector } = useChatState();

  const plugins = usePlugins();

  const pluginsWithActions = plugins.plugins.filter(
    (plugin) => plugin.onActionClick,
  );

  return (
    <>
      {pluginsWithActions.length > 0 && (
        <ToolbarSection>
          {pluginsWithActions.map((plugin) => (
            <ToolbarButton
              key={plugin.pluginName}
              onClick={
                openPluginName === plugin.pluginName
                  ? closePlugin
                  : () => openPlugin(plugin.pluginName)
              }
              active={openPluginName === plugin.pluginName}
            >
              {plugin.iconSvg ? (
                <span className="size-4 *:size-full">{plugin.iconSvg}</span>
              ) : (
                <PuzzleIcon className="size-4" />
              )}
            </ToolbarButton>
          ))}
        </ToolbarSection>
      )}
      <ToolbarSection>
        <ToolbarButton
          onClick={
            isChatOpen
              ? closeChat
              : () => {
                  openChat();
                  startPromptCreation();
                  startContextSelector();
                }
          }
          active={isChatOpen}
        >
          <MessageCircleIcon className="size-4" />
        </ToolbarButton>
      </ToolbarSection>
    </>
  );
}
