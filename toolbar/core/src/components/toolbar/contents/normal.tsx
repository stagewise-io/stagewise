import type { VNode } from 'preact';
import type { useChatState } from '@/hooks/use-chat-state';
import { usePlugins } from '@/hooks/use-plugins';
import { SettingsButton } from '../settings';
import { ToolbarSection } from '../section';
import { ToolbarButton } from '../button';
import { PuzzleIcon } from 'lucide-react';
import { MessageCircleIcon } from 'lucide-react';

export function NormalStateButtons({
  handleButtonClick,
  pluginBox,
  setPluginBox,
  openPanel,
  setOpenPanel,
  chatState,
}: {
  handleButtonClick: (handler: () => void) => (e: MouseEvent) => void;
  pluginBox: null | {
    component: VNode;
    pluginName: string;
  };
  setPluginBox: (value: typeof pluginBox) => void;
  openPanel: null | 'settings' | { pluginName: string; component: VNode };
  setOpenPanel: (value: typeof openPanel) => void;
  chatState: ReturnType<typeof useChatState>;
}) {
  const plugins = usePlugins();

  const pluginsWithActions = plugins.plugins.filter(
    (plugin) => plugin.onActionClick,
  );

  // Handler for settings button
  const handleOpenSettings = () =>
    setOpenPanel(openPanel === 'settings' ? null : 'settings');

  return (
    <>
      <SettingsButton
        onOpenPanel={handleOpenSettings}
        isActive={openPanel === 'settings'}
      />
      {pluginsWithActions.length > 0 && (
        <ToolbarSection>
          {pluginsWithActions.map((plugin) => (
            <ToolbarButton
              key={plugin.pluginName}
              onClick={handleButtonClick(() => {
                if (pluginBox?.pluginName !== plugin.pluginName) {
                  const component = plugin.onActionClick();

                  if (component) {
                    setPluginBox({
                      component: plugin.onActionClick(),
                      pluginName: plugin.pluginName,
                    });
                  }
                } else {
                  setPluginBox(null);
                }
              })}
              active={pluginBox?.pluginName === plugin.pluginName}
            >
              {plugin.iconSvg ? (
                <span className="size-4 stroke-zinc-950 text-zinc-950 *:size-full">
                  {plugin.iconSvg}
                </span>
              ) : (
                <PuzzleIcon className="size-4" />
              )}
            </ToolbarButton>
          ))}
        </ToolbarSection>
      )}
      <ToolbarSection>
        <ToolbarButton
          onClick={handleButtonClick(() =>
            chatState.isPromptCreationActive
              ? chatState.stopPromptCreation()
              : chatState.startPromptCreation(),
          )}
          active={chatState.isPromptCreationActive}
        >
          <MessageCircleIcon className="size-4 stroke-zinc-950" />
        </ToolbarButton>
      </ToolbarSection>
    </>
  );
}
