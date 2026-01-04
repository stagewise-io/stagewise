import { WorkspaceInfoBadge } from './_components/workspace-info';
import { cn } from '@/utils';
import { IconHistoryFill18, IconPlusFill18 } from 'nucleo-ui-fill-18';
import { IconMessagesFillDuo18 } from 'nucleo-ui-fill-duo-18';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import { IconTrash2Outline24 } from 'nucleo-core-outline-24';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import TimeAgo from 'react-timeago';
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';
import type { Chat } from '@shared/karton-contracts/ui';
import { useCallback, useMemo } from 'react';
import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyComboText } from '@/components/hotkey-combo-text';

export function SidebarTopSection({ isCollapsed }: { isCollapsed: boolean }) {
  const createChat = useKartonProcedure((p) => p.agentChat.create);
  const switchChat = useKartonProcedure((p) => p.agentChat.switch);
  const deleteChat = useKartonProcedure((p) => p.agentChat.delete);
  const chats = useKartonState((s) => s.agentChat?.chats) || {};
  const platform = useKartonState((s) => s.appInfo.platform);
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const workspaceStatus = useKartonState((s) => s.workspaceStatus);
  const activeChatId = useKartonState((s) => s.agentChat?.activeChatId || null);
  const isWorking = useKartonState((s) => s.agentChat?.isWorking);

  const showChatListButton = useMemo(() => {
    return Object.keys(chats).length > 1 && workspaceStatus !== 'setup';
  }, [chats, workspaceStatus]);

  const showNewChatButton = useMemo(() => {
    return activeChatId && workspaceStatus !== 'setup';
  }, [activeChatId, workspaceStatus]);

  const groupedChats = useMemo(() => groupChatsByTime(chats), [chats]);

  // Helper to create a new chat and focus the input
  const createChatAndFocus = useCallback(async () => {
    await createChat();
    window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
  }, [createChat]);

  // Hotkey: CTRL+N to create new agent chat (disabled when agent is working)
  useHotKeyListener(() => {
    if (showNewChatButton && !isWorking) void createChatAndFocus();
  }, HotkeyActions.CTRL_N);

  const minimalFormatter = buildFormatter({
    prefixAgo: '',
    prefixFromNow: '',
    suffixAgo: '',
    suffixFromNow: '',
    second: '1s',
    seconds: (value) => `${value}s`,
    minute: '1m',
    minutes: (value) => `${value}m`,
    hour: '1h',
    hours: (value) => `${value}h`,
    day: '1d',
    days: (value) => `${value}d`,
    week: '1w',
    weeks: (value) => `${value}w`,
    month: '1M',
    months: (value) => `${value}M`,
    year: '1y',
    years: (value) => `${value}y`,
    wordSeparator: '',
    numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  });

  return (
    <div
      className={cn(
        'app-drag flex h-8 max-h-8 min-h-8 flex-row items-center justify-start gap-2 pr-2 group-data-[collapsed=true]:hidden',
        platform === 'darwin' && !isFullScreen ? 'ml-18' : 'ml-0',
      )}
    >
      {!isCollapsed && <WorkspaceInfoBadge />}
      <div className="app-no-drag glass-body ml-1 @[350px]:inline-flex hidden shrink-0 items-center rounded-full px-2 py-0.5 font-medium text-[10px] text-primary">
        Alpha
      </div>
      <div className="flex-1 group-data-[collapsed=true]:hidden" />
      {!isCollapsed && (
        <div className="@[250px]:flex hidden shrink-0 flex-row items-center">
          {showNewChatButton && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  disabled={isWorking}
                  onClick={() => void createChatAndFocus()}
                >
                  <IconPlusFill18 className="size-4 text-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  Create new chat (
                  <HotkeyComboText action={HotkeyActions.CTRL_N} />)
                </span>
              </TooltipContent>
            </Tooltip>
          )}
          {showChatListButton && (
            <Menu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <MenuTrigger>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="app-no-drag shrink-0"
                        disabled={isWorking}
                      >
                        <IconHistoryFill18 className="size-4 text-foreground" />
                      </Button>
                    </MenuTrigger>
                  }
                />
                <TooltipContent>
                  <span>Show chat history</span>
                </TooltipContent>
              </Tooltip>
              <MenuContent>
                <div className="scrollbar-hover-only flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {Object.entries(groupedChats).map(([label, chats], index) => (
                    <>
                      <span className="shrink-0 px-2 py-1 font-normal text-muted-foreground/60 text-xs">
                        {label}
                      </span>
                      {Object.entries(chats).map(([chatId, chat]) => {
                        return (
                          <MenuItem
                            key={chatId}
                            className="shrink-0"
                            disabled={isWorking}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isWorking) void switchChat(chatId);
                            }}
                          >
                            <div className="group flex w-64 flex-row items-center justify-start gap-2">
                              <IconMessagesFillDuo18 className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium text-sm">
                                {chat.title}
                              </span>
                              <span className="shrink-0 font-normal text-muted-foreground/60 text-xs">
                                <TimeAgo
                                  date={chat.createdAt}
                                  formatter={minimalFormatter}
                                  live={false}
                                />
                              </span>

                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="ml-auto shrink-0 opacity-0 group-hover:opacity-100"
                                disabled={isWorking}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isWorking) void deleteChat(chatId);
                                }}
                              >
                                <IconTrash2Outline24 className="size-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </MenuItem>
                        );
                      })}
                      {index < Object.entries(groupedChats).length - 1 && (
                        <MenuSeparator />
                      )}
                    </>
                  ))}
                </div>
              </MenuContent>
            </Menu>
          )}
        </div>
      )}
    </div>
  );
}

type TimeAgoLabel = string;

/**
 *
 * @param chats The chats to sort
 * @returns The sorted chats, labeled by time strings, e.g. : 'Today', 'Yesterday', '2 days ago', '3 days ago', '1 week ago', '2 weeks ago', '1 month ago', '2 months ago', '1 year ago', '2 years ago', etc.
 */
function groupChatsByTime(
  chats: Record<string, Chat>,
): Record<TimeAgoLabel, Record<string, Chat>> {
  // Helper function to get time label for a chat
  function getTimeLabel(date: Date): string {
    const now = new Date();
    const chatDate = new Date(date);

    // Calculate days difference
    const diffTime = now.getTime() - chatDate.getTime();
    const daysAgo = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Daily grouping (0-7 days)
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo >= 2 && daysAgo <= 7) return `${daysAgo} days ago`;

    // Weekly grouping (8-29 days)
    if (daysAgo < 30) {
      const weeksAgo = Math.floor(daysAgo / 7);
      return weeksAgo === 1 ? 'last week' : `${weeksAgo} weeks ago`;
    }

    // Monthly grouping (30 days to 1 year)
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const chatYear = chatDate.getFullYear();
    const chatMonth = chatDate.getMonth();

    const monthsDiff = (nowYear - chatYear) * 12 + (nowMonth - chatMonth);

    if (monthsDiff < 12) {
      return monthsDiff === 1 ? 'Last month' : `${monthsDiff} months ago`;
    }

    // Yearly grouping (1+ years)
    const yearsDiff = nowYear - chatYear;
    return yearsDiff === 1 ? '1 year ago' : `${yearsDiff} years ago`;
  }

  // Group chats by time label
  const grouped: Record<string, Record<string, Chat>> = {};

  for (const [chatId, chat] of Object.entries(chats)) {
    const label = getTimeLabel(chat.createdAt);

    if (!grouped[label]) grouped[label] = {};

    grouped[label][chatId] = chat;
  }

  // Sort chats within each group by createdAt descending (newest first)
  for (const label in grouped) {
    const sortedEntries = Object.entries(grouped[label]).sort(
      ([, a], [, b]) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    // Rebuild the record in sorted order
    grouped[label] = Object.fromEntries(sortedEntries);
  }

  return grouped;
}
