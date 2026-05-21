import type { SelectItem } from '@stagewise/stage-ui/components/select';
import type { WorkspaceGitAction } from '@shared/karton-contracts/ui/shared-types';
import type { Patch } from 'immer';
import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from '@stagewise/stage-ui/components/combobox';
import {
  generateWorktreeName,
  getBranchSelectItems,
  getBranchSelectItemsFromGit,
  getDefaultBranchValue,
  getWorktreeSelectItems,
  getWorktreeSelectItemsFromGit,
} from './worktree-utils';
import {
  IconCheckFill18,
  IconChevronDownFill18,
  IconPlusFill18,
  IconXmarkFill18,
} from 'nucleo-ui-fill-18';
import {
  IconBranchOutOutline18,
  IconChevronRightOutline18,
  IconCodeBranchOutline18,
  IconCopyOutline18,
  IconFolder5Outline18,
  IconPenDrawSparkleOutline18,
} from 'nucleo-ui-outline-18';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { Popover as PopoverBase } from '@base-ui/react/popover';
import {
  Popover,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { CheckIcon, XIcon, Loader2Icon } from 'lucide-react';

import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useTrack } from '@ui/hooks/use-track';
import { IdeLogo } from '@ui/components/ide-logo';
import { getIDEFileUrl, IDE_SELECTION_ITEMS } from '@ui/utils';
import { getBaseName } from '@shared/path-utils';
import { FileContextMenu } from '@ui/components/file-context-menu';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import {
  type MountEntry,
  type MountedWorkspaceGitStatusSummary,
  type MountedWorkspaceGitSummary,
  EMPTY_MOUNTS,
  type WorkspaceGitBranchesResult,
  type WorkspaceGitWorktreesResult,
  type WorkspaceGitCreateBranchOptions,
  type WorkspaceGitCreateWorktreeOptions,
  type WorkspaceGitCreateWorktreeResult,
  type WorkspaceGitMutationResult,
} from '@shared/karton-contracts/ui';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { applyWorkspaceGitActionPreferences } from './workspace-action-preferences';

const EMPTY_SKILLS: string[] = [];

function formatGitRef(git: MountedWorkspaceGitSummary): string | null {
  return git.branch ?? git.headSha?.slice(0, 7) ?? null;
}

function formatGitStatus(
  status: MountedWorkspaceGitStatusSummary | null,
): string | null {
  if (!status?.dirty) return null;

  const parts = [
    status.stagedCount > 0 ? `+${status.stagedCount}` : null,
    status.unstagedCount > 0 ? `*${status.unstagedCount}` : null,
    status.untrackedCount > 0 ? `!${status.untrackedCount}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : null;
}

const WorkspaceBadge = memo(function WorkspaceBadge({
  mount,
  onUnmount,
  agentInstanceId,
}: {
  mount: MountEntry;
  onUnmount: (prefix: string) => void;
  agentInstanceId: string;
}) {
  const name = getBaseName(mount.path) || mount.path;
  const gitRef = mount.git ? formatGitRef(mount.git) : null;

  const respectAgentsMd = useKartonState(
    (s) =>
      s.preferences?.agent?.workspaceSettings?.[mount.path]?.respectAgentsMd ??
      false,
  );
  const preferences = useKartonState((s) => s.preferences);
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const generateWorkspaceMd = useKartonProcedure(
    (p) => p.toolbox.generateWorkspaceMd,
  );

  const isGeneratingWorkspaceMd = useKartonState((s) => {
    for (const id in s.agents.instances) {
      const inst = s.agents.instances[id];
      if (!inst) continue;
      if (inst.type !== AgentTypes.WORKSPACE_MD) continue;
      if (!inst.state.isWorking) continue;
      const agentPath = s.toolbox[id]?.workspace?.mounts?.[0]?.path;
      if (agentPath === mount.path) return true;
    }
    return false;
  });

  const handleGenerateWorkspaceMd = useCallback(() => {
    void generateWorkspaceMd(agentInstanceId, mount.prefix);
  }, [agentInstanceId, mount.prefix, generateWorkspaceMd]);

  const handleToggleAgentsMd = useCallback(
    (checked: boolean) => {
      const currentSettings =
        preferences?.agent?.workspaceSettings?.[mount.path];
      const patches = currentSettings
        ? [
            {
              op: 'replace' as const,
              path: [
                'agent',
                'workspaceSettings',
                mount.path,
                'respectAgentsMd',
              ],
              value: checked,
            },
          ]
        : [
            {
              op: 'add' as const,
              path: ['agent', 'workspaceSettings', mount.path],
              value: { respectAgentsMd: checked },
            },
          ];
      void preferencesUpdate(patches);
    },
    [mount.path, preferences, preferencesUpdate],
  );

  const disabledSkills = useKartonState(
    (s) =>
      s.preferences?.agent?.workspaceSettings?.[mount.path]?.disabledSkills ??
      EMPTY_SKILLS,
  );

  const handleToggleSkill = useCallback(
    (skillName: string, enabled: boolean) => {
      const currentSettings =
        preferences?.agent?.workspaceSettings?.[mount.path];
      const current = currentSettings?.disabledSkills ?? [];
      const next = enabled
        ? current.filter((s) => s !== skillName)
        : [...current, skillName];

      const patches = currentSettings
        ? [
            {
              op: 'replace' as const,
              path: [
                'agent',
                'workspaceSettings',
                mount.path,
                'disabledSkills',
              ],
              value: next,
            },
          ]
        : [
            {
              op: 'add' as const,
              path: ['agent', 'workspaceSettings', mount.path],
              value: { respectAgentsMd: false, disabledSkills: next },
            },
          ];
      void preferencesUpdate(patches);
    },
    [mount.path, preferences, preferencesUpdate],
  );

  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );

  const resolveAbsolute = useCallback((p: string) => p, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [sidePanelContent, setSidePanelContent] =
    useState<SidePanelContent | null>(null);
  const [itemCenterY, setItemCenterY] = useState(0);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Separate timer for the *initial* open of the side panel. The panel
  // would otherwise pop in instantly when the cursor passes over a row
  // on the way to other actions (e.g. "Create worktree"), which is
  // distracting. Once a panel is already shown, switches between rows
  // remain instant.
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancelPendingClear = useCallback(() => {
    if (clearTimerRef.current !== undefined) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = undefined;
    }
  }, []);

  const cancelPendingOpen = useCallback(() => {
    if (openTimerRef.current !== undefined) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = undefined;
    }
  }, []);

  const scheduleClear = useCallback(() => {
    cancelPendingClear();
    cancelPendingOpen();
    clearTimerRef.current = setTimeout(() => {
      setSidePanelContent(null);
      clearTimerRef.current = undefined;
    }, 150);
  }, [cancelPendingClear, cancelPendingOpen]);

  useEffect(
    () => () => {
      cancelPendingClear();
      cancelPendingOpen();
    },
    [cancelPendingClear, cancelPendingOpen],
  );

  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useMemo(
    () => ({ current: scrollViewport }),
    [scrollViewport],
  ) as React.RefObject<HTMLElement>;

  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  useLayoutEffect(() => {
    if (!sidePanelContent || !sidePanelRef.current || !containerRef.current)
      return;
    const panelHeight = sidePanelRef.current.offsetHeight;
    const containerHeight = containerRef.current.offsetHeight;

    let offset = itemCenterY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, containerHeight - panelHeight);

    setSidePanelOffset(offset);
  }, [sidePanelContent, itemCenterY]);

  const handleItemHover = useCallback(
    (content: SidePanelContent, event: React.MouseEvent<HTMLElement>) => {
      cancelPendingClear();
      cancelPendingOpen();
      const target = event.currentTarget;
      const container = containerRef.current;

      const apply = () => {
        if (!container) {
          setSidePanelContent(content);
          return;
        }
        const containerRect = container.getBoundingClientRect();
        const itemRect = target.getBoundingClientRect();
        const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;
        setItemCenterY(centerY);
        setSidePanelContent(content);
      };

      // Switching between rows once a panel is open is instant; the
      // very first open is delayed so quick traversals don't trigger
      // the side panel.
      if (sidePanelContent) {
        apply();
      } else {
        openTimerRef.current = setTimeout(() => {
          openTimerRef.current = undefined;
          apply();
        }, 200);
      }
    },
    [cancelPendingClear, cancelPendingOpen, sidePanelContent],
  );

  const unmountIcon = (
    <Tooltip>
      <TooltipTrigger>
        <span
          data-unmount
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onUnmount(mount.prefix);
          }}
          className={cn(
            'group/unmount relative flex size-4 shrink-0 cursor-pointer items-center justify-center',
          )}
        >
          {/*
            Match the action-selector trigger icon vocabulary so the
            post-message badge reads the same way: worktree icon when
            the mount is a git worktree, branch icon for a plain
            repo, folder otherwise.
          */}
          {mount.git?.isWorktree ? (
            <IconBranchOutOutline18 className="size-3 shrink-0 group-hover/workspace:opacity-0 group-focus-visible/workspace:opacity-0" />
          ) : mount.git ? (
            <IconCodeBranchOutline18 className="size-3 shrink-0 group-hover/workspace:opacity-0 group-focus-visible/workspace:opacity-0" />
          ) : (
            <IconFolder5Outline18 className="size-3 shrink-0 group-hover/workspace:opacity-0 group-focus-visible/workspace:opacity-0" />
          )}
          <IconXmarkFill18 className="absolute size-3.5 text-muted-foreground opacity-0 group-hover/unmount:text-foreground group-hover/workspace:opacity-100 group-focus-visible/workspace:opacity-100" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Disconnect workspace</TooltipContent>
    </Tooltip>
  );

  return (
    <Popover>
      <FileContextMenu relativePath={mount.path} resolvePath={resolveAbsolute}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              'group/workspace max-w-56 justify-start gap-1 px-0',
              'text-muted-foreground hover:text-muted-foreground',
              'focus-visible:text-foreground',
              'has-[[data-popup-open]]:text-foreground',
            )}
          >
            {unmountIcon}
            <span className="min-w-0 truncate group-hover/workspace:text-foreground group-focus-visible/workspace:text-foreground group-has-[[data-unmount]:hover]/workspace:text-muted-foreground">
              {name}
            </span>
            {gitRef && (
              <span className="min-w-0 truncate text-subtle-foreground group-hover/workspace:text-muted-foreground group-focus-visible/workspace:text-muted-foreground group-has-[[data-unmount]:hover]/workspace:text-subtle-foreground">
                {gitRef}
              </span>
            )}
            <IconChevronDownFill18 className="size-3 shrink-0 text-subtle-foreground group-hover/workspace:text-muted-foreground group-focus-visible/workspace:text-muted-foreground group-has-[[data-unmount]:hover]/workspace:text-subtle-foreground" />
          </Button>
        </PopoverTrigger>
      </FileContextMenu>

      <PopoverBase.Portal>
        <PopoverBase.Backdrop
          className="pointer-events-auto fixed inset-0 z-40 size-full"
          onClick={(e) => e.stopPropagation()}
        />
        <PopoverBase.Positioner
          sideOffset={8}
          side="top"
          align="start"
          className="z-50"
        >
          <div
            ref={containerRef}
            className="relative flex flex-row items-start gap-1"
            onMouseLeave={scheduleClear}
          >
            <PopoverBase.Popup
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex min-w-72 max-w-[28rem] flex-col gap-0 p-0',
                'rounded-lg bg-background ring-1 ring-border-subtle',
                'text-foreground shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'origin-(--transform-origin)',
                'data-ending-style:scale-90 data-starting-style:scale-90',
                'data-ending-style:opacity-0 data-starting-style:opacity-0',
              )}
            >
              <WorkspacePreviewCardContent
                mount={mount}
                name={name}
                onItemHover={handleItemHover}
                onItemLeave={cancelPendingOpen}
                activeRow={
                  sidePanelContent?.type === 'contextFiles'
                    ? 'contextFiles'
                    : sidePanelContent?.type === 'skillsList'
                      ? 'skillsList'
                      : null
                }
              />
            </PopoverBase.Popup>

            {sidePanelContent && (
              <div
                ref={sidePanelRef}
                onMouseEnter={cancelPendingClear}
                className={cn(
                  'absolute left-full ml-1 flex w-72 flex-col rounded-lg border border-derived bg-background text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
                  'fade-in-0 slide-in-from-left-1 animate-in duration-150',
                  'p-0',
                )}
                style={{ top: sidePanelOffset }}
              >
                {sidePanelContent.type === 'workspaceMd' ||
                sidePanelContent.type === 'agentsMd' ? (
                  <MdSidePanelContent
                    sidePanelContent={sidePanelContent}
                    isIncludedInAgentContext={
                      sidePanelContent.type === 'agentsMd'
                        ? respectAgentsMd
                        : true
                    }
                    maskStyle={maskStyle}
                    onViewportRef={setScrollViewport}
                    openInIdeSelection={openInIdeSelection}
                  />
                ) : sidePanelContent.type === 'contextFiles' ? (
                  <ContextFilesSidePanel
                    mount={mount}
                    name={name}
                    respectAgentsMd={respectAgentsMd}
                    onToggleAgentsMd={handleToggleAgentsMd}
                    isGeneratingWorkspaceMd={isGeneratingWorkspaceMd}
                    onGenerateWorkspaceMd={handleGenerateWorkspaceMd}
                    openInIdeSelection={openInIdeSelection}
                  />
                ) : (
                  <SkillsListSidePanel
                    skills={mount.skills}
                    disabledSkills={disabledSkills}
                    onToggleSkill={handleToggleSkill}
                  />
                )}
              </div>
            )}
          </div>
        </PopoverBase.Positioner>
      </PopoverBase.Portal>
    </Popover>
  );
});

function MdSidePanelContent({
  sidePanelContent,
  maskStyle,
  onViewportRef,
  openInIdeSelection,
  isIncludedInAgentContext,
}: {
  sidePanelContent: Extract<
    SidePanelContent,
    { type: 'workspaceMd' | 'agentsMd' }
  >;
  maskStyle: React.CSSProperties;
  onViewportRef: (el: HTMLElement | null) => void;
  openInIdeSelection: OpenFilesInIde;
  isIncludedInAgentContext: boolean;
}) {
  const absPath =
    sidePanelContent.type === 'workspaceMd'
      ? `${sidePanelContent.workspacePath}/.stagewise/WORKSPACE.md`
      : `${sidePanelContent.workspacePath}/AGENTS.md`;

  const ideHref = getIDEFileUrl(absPath, openInIdeSelection);
  const ideName = IDE_SELECTION_ITEMS[openInIdeSelection];

  return (
    <>
      <div
        className={cn(
          'border-derived-subtle border-b px-2.5 py-2',
          !isIncludedInAgentContext && 'opacity-60',
        )}
      >
        <span className="font-semibold">
          {sidePanelContent.type === 'workspaceMd'
            ? 'WORKSPACE.md'
            : 'AGENTS.md'}
        </span>
      </div>
      <div
        className={cn(
          'relative overflow-hidden rounded-b-lg',
          !isIncludedInAgentContext && 'opacity-60',
        )}
      >
        <OverlayScrollbar
          className="mask-alpha max-h-64"
          style={
            {
              ...maskStyle,
              '--os-scrollbar-inset-top': '8px',
              '--os-scrollbar-inset-bottom': ideHref ? '24px' : '0px',
            } as React.CSSProperties
          }
          options={{ overflow: { x: 'hidden', y: 'scroll' } }}
          onViewportRef={onViewportRef}
        >
          <pre className="wrap-break-word whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] text-muted-foreground leading-relaxed">
            {sidePanelContent.content}
          </pre>
        </OverlayScrollbar>
        {ideHref && (
          <a
            href={ideHref}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute right-0 bottom-0 flex h-6 items-center gap-1 rounded-tl-lg border-derived border-t border-l bg-background px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground dark:bg-surface-1"
          >
            <IdeLogo ide={openInIdeSelection} className="size-3" />
            <span>Open in {ideName}</span>
          </a>
        )}
      </div>
    </>
  );
}

type SidePanelContent =
  | { type: 'workspaceMd'; content: string; workspacePath: string }
  | { type: 'agentsMd'; content: string; workspacePath: string }
  | { type: 'contextFiles' }
  | { type: 'skillsList' };

function ContextFilesSidePanel({
  mount,
  name,
  respectAgentsMd,
  onToggleAgentsMd,
  isGeneratingWorkspaceMd,
  onGenerateWorkspaceMd,
  openInIdeSelection,
}: {
  mount: MountEntry;
  name: string;
  respectAgentsMd: boolean;
  onToggleAgentsMd: (checked: boolean) => void;
  isGeneratingWorkspaceMd: boolean;
  onGenerateWorkspaceMd: () => void;
  openInIdeSelection: OpenFilesInIde;
}) {
  const agentsMdDisabled = mount.agentsMdContent === null;
  const [hoveredContextFile, setHoveredContextFile] = useState<Extract<
    SidePanelContent,
    { type: 'workspaceMd' | 'agentsMd' }
  > | null>(null);
  const [nestedPanelOffset, setNestedPanelOffset] = useState(0);
  const workspaceMdRowRef = useRef<HTMLDivElement>(null);
  const agentsMdRowRef = useRef<HTMLDivElement>(null);
  const nestedPanelRef = useRef<HTMLDivElement>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useMemo(
    () => ({ current: scrollViewport }),
    [scrollViewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  useLayoutEffect(() => {
    if (!hoveredContextFile) return;
    const itemEl =
      hoveredContextFile.type === 'workspaceMd'
        ? workspaceMdRowRef.current
        : agentsMdRowRef.current;
    const panel = nestedPanelRef.current;
    if (!itemEl || !panel) return;

    const containerHeight = itemEl.parentElement?.offsetHeight ?? 0;
    const itemCenterY = itemEl.offsetTop + itemEl.offsetHeight / 2;
    const panelHeight = panel.offsetHeight;

    let offset = itemCenterY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, containerHeight - panelHeight);

    setNestedPanelOffset(offset);
  }, [hoveredContextFile]);

  return (
    <>
      <div className="border-derived-subtle border-b px-2.5 py-2">
        <span className="font-semibold">Context files</span>
      </div>
      <div
        className="relative flex flex-col gap-1 px-2.5 py-2"
        onMouseLeave={() => setHoveredContextFile(null)}
      >
        {/* WORKSPACE.md row */}
        <div
          ref={workspaceMdRowRef}
          className="flex items-center gap-1.5"
          onMouseEnter={
            mount.workspaceMdContent
              ? () =>
                  setHoveredContextFile({
                    type: 'workspaceMd',
                    content: mount.workspaceMdContent!,
                    workspacePath: mount.path,
                  })
              : undefined
          }
        >
          {mount.workspaceMdContent !== null ? (
            <>
              <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 px-0 text-muted-foreground text-xs">
                WORKSPACE.md
              </span>
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex items-center gap-1.5 text-subtle-foreground">
                    <XIcon className="size-3 shrink-0" />
                    <span className="text-xs">WORKSPACE.md</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  No WORKSPACE.md available for {name}.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto shrink-0 pr-0.5"
                    disabled={isGeneratingWorkspaceMd}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateWorkspaceMd();
                    }}
                  >
                    {isGeneratingWorkspaceMd ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <IconPenDrawSparkleOutline18 className="size-3" />
                    )}
                    {isGeneratingWorkspaceMd ? 'Generating...' : 'Generate'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Automatically generate a WORKSPACE.md to improve agent
                  performance.
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* AGENTS.md toggle */}
        {mount.agentsMdContent !== null && (
          <Tooltip>
            <TooltipTrigger>
              <div
                ref={agentsMdRowRef}
                className="flex items-center gap-1.5"
                onMouseEnter={
                  mount.agentsMdContent
                    ? () =>
                        setHoveredContextFile({
                          type: 'agentsMd',
                          content: mount.agentsMdContent!,
                          workspacePath: mount.path,
                        })
                    : undefined
                }
              >
                {respectAgentsMd ? (
                  <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                  <XIcon className="size-3 shrink-0 text-subtle-foreground" />
                )}
                <label
                  htmlFor="agents-md-toggle"
                  className={cn(
                    'flex-1 px-0 text-xs',
                    respectAgentsMd
                      ? 'text-muted-foreground'
                      : 'text-subtle-foreground',
                  )}
                >
                  AGENTS.md
                </label>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    size="xs"
                    id="agents-md-toggle"
                    checked={respectAgentsMd}
                    onCheckedChange={onToggleAgentsMd}
                    disabled={agentsMdDisabled}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {respectAgentsMd
                ? 'Included in agent context'
                : 'Not included in agent context'}
            </TooltipContent>
          </Tooltip>
        )}

        {hoveredContextFile && (
          <div
            ref={nestedPanelRef}
            className={cn(
              'absolute left-full z-10 ml-1 flex w-72 flex-col rounded-lg border border-derived bg-background text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
              'fade-in-0 slide-in-from-left-1 animate-in duration-150',
            )}
            style={{ top: nestedPanelOffset }}
          >
            <MdSidePanelContent
              sidePanelContent={hoveredContextFile}
              isIncludedInAgentContext={
                hoveredContextFile.type === 'agentsMd' ? respectAgentsMd : true
              }
              maskStyle={maskStyle}
              onViewportRef={setScrollViewport}
              openInIdeSelection={openInIdeSelection}
            />
          </div>
        )}
      </div>
    </>
  );
}

function SkillsListSidePanel({
  skills,
  disabledSkills,
  onToggleSkill,
}: {
  skills: MountEntry['skills'];
  disabledSkills: string[];
  onToggleSkill: (skillName: string, enabled: boolean) => void;
}) {
  const sortedSkills = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills],
  );

  const [hoveredSkillName, setHoveredSkillName] = useState<string | null>(null);
  const [nestedPanelOffset, setNestedPanelOffset] = useState(0);
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const nestedPanelRef = useRef<HTMLDivElement>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useMemo(
    () => ({ current: scrollViewport }),
    [scrollViewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  // Position the third-level (skill description) panel relative to the
  // hovered skill row's vertical center, clamped to the scroll viewport.
  useLayoutEffect(() => {
    if (!hoveredSkillName) return;
    const itemEl = itemRefs.current.get(hoveredSkillName);
    const container = scrollViewport;
    const panel = nestedPanelRef.current;
    if (!itemEl || !container || !panel) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();
    const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

    const panelHeight = panel.offsetHeight;
    const containerHeight = container.offsetHeight;

    let offset = centerY - panelHeight / 2;
    offset = Math.max(0, offset);
    offset = Math.min(offset, containerHeight - panelHeight);

    setNestedPanelOffset(offset);
  }, [hoveredSkillName, scrollViewport]);

  const hoveredSkill = hoveredSkillName
    ? sortedSkills.find((s) => s.name === hoveredSkillName)
    : undefined;

  return (
    <>
      <div className="border-derived-subtle border-b px-2.5 py-2">
        <span className="font-semibold">Skills</span>
      </div>
      <div className="relative">
        <OverlayScrollbar
          className="mask-alpha max-h-64"
          style={maskStyle}
          options={{ overflow: { x: 'hidden', y: 'scroll' } }}
          onViewportRef={setScrollViewport}
        >
          <div
            className="flex flex-col gap-0.75 px-2.5 py-2"
            onMouseLeave={() => setHoveredSkillName(null)}
          >
            {sortedSkills.map((skill) => {
              const isEnabled = !disabledSkills.includes(skill.name);
              const toggleId = `skill-toggle-${skill.name}`;
              return (
                <div
                  key={skill.name}
                  ref={(el) => {
                    itemRefs.current.set(skill.name, el);
                  }}
                  className="flex items-center gap-1.5"
                  onMouseEnter={() => setHoveredSkillName(skill.name)}
                >
                  <label
                    htmlFor={toggleId}
                    className={cn(
                      'flex-1 truncate text-xs leading-normal',
                      isEnabled
                        ? 'text-muted-foreground'
                        : 'text-subtle-foreground',
                    )}
                  >
                    {skill.name}
                  </label>
                  <Tooltip>
                    <TooltipTrigger>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                          size="xs"
                          id={toggleId}
                          checked={isEnabled}
                          onCheckedChange={(checked) =>
                            onToggleSkill(skill.name, checked)
                          }
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isEnabled
                        ? `${skill.name} is included in agent context`
                        : `Include ${skill.name} in agent context`}
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </OverlayScrollbar>
        {hoveredSkill && (
          <div
            ref={nestedPanelRef}
            className={cn(
              'absolute left-full ml-1 flex w-64 flex-col gap-1 rounded-lg border border-derived bg-background p-2.5 text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
              'fade-in-0 slide-in-from-left-1 animate-in duration-150',
              disabledSkills.includes(hoveredSkill.name) && 'opacity-60',
            )}
            style={{ top: nestedPanelOffset }}
          >
            <div className="font-semibold">{hoveredSkill.name}</div>
            <div className="text-muted-foreground">
              {hoveredSkill.description}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function WorkspacePreviewCardContent({
  mount,
  name,
  onItemHover,
  onItemLeave,
  activeRow,
}: {
  mount: MountEntry;
  name: string;
  onItemHover: (
    content: SidePanelContent,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  /** Cancels a pending open if the cursor leaves the row before the
   * open delay elapses. */
  onItemLeave: () => void;
  activeRow: 'contextFiles' | 'skillsList' | null;
}) {
  const hasSkills = mount.skills.length > 0;
  const gitRef = mount.git ? formatGitRef(mount.git) : null;
  const gitStatus = mount.git ? formatGitStatus(mount.git.status) : null;

  const handleCopyPath = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      void navigator.clipboard?.writeText(mount.path);
    },
    [mount.path],
  );

  return (
    <div className="flex flex-col">
      {/* Header: folder name + git branch + path */}
      <div className="flex flex-col items-start gap-0.5 px-2.5 pt-1.5 pb-2">
        <div className="flex max-w-full items-center gap-1.5 text-xs leading-none">
          <span className="min-w-0 truncate font-semibold text-foreground">
            {name}
          </span>
          {mount.git && gitRef && (
            <>
              {/* Match the WorkspaceBadge icon vocabulary so the header label
                  reads consistently across surfaces: worktree icon when this
                  mount is a git worktree, branch icon for a plain repo. */}
              {mount.git.isWorktree ? (
                <IconBranchOutOutline18 className="size-3 shrink-0 text-subtle-foreground" />
              ) : (
                <IconCodeBranchOutline18 className="size-3 shrink-0 text-subtle-foreground" />
              )}
              <span className="max-w-36 shrink-0 truncate text-2xs text-subtle-foreground leading-none">
                {gitRef}
              </span>
            </>
          )}
          {gitStatus && (
            <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums leading-none">
              {gitStatus}
            </span>
          )}
        </div>
        <span
          className="max-w-full truncate text-2xs text-subtle-foreground leading-normal"
          dir="rtl"
        >
          <span dir="ltr">{mount.path}</span>
        </span>
      </div>

      <div className="mx-2.5 border-border-subtle border-t" />

      {/* Context files row — opens side panel on hover */}
      <div
        data-active={activeRow === 'contextFiles' ? '' : undefined}
        className={cn(
          'group/row flex cursor-default items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground',
          'hover:text-foreground data-[active]:text-foreground',
        )}
        onMouseEnter={(e) => onItemHover({ type: 'contextFiles' }, e)}
        onMouseLeave={onItemLeave}
      >
        <span className="font-medium text-xs">Context files</span>
        <IconChevronRightOutline18 className="ml-auto size-3 shrink-0" />
      </div>

      {/* Skills row — opens side panel on hover */}
      {hasSkills && (
        <div
          data-active={activeRow === 'skillsList' ? '' : undefined}
          className={cn(
            'group/row flex cursor-default items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground',
            'hover:text-foreground data-[active]:text-foreground',
          )}
          onMouseEnter={(e) => onItemHover({ type: 'skillsList' }, e)}
          onMouseLeave={onItemLeave}
        >
          <span className="font-medium text-xs">Skills</span>
          <IconChevronRightOutline18 className="ml-auto size-3 shrink-0" />
        </div>
      )}

      <div className="flex justify-end gap-0.5 px-2.5 py-1.5">
        <Tooltip>
          <TooltipTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon-2xs"
              aria-label="Copy path"
              onClick={handleCopyPath}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
            >
              <IconCopyOutline18 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy path</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ============================================================================
// Inline workspace action selector
// ============================================================================
//
// Renders in place of the regular WorkspaceBadge for git-rooted mounts while
// the chat is empty. Collapses workspace identity, the chosen action, and
// its parameters into a single trigger; clicking the trigger opens a popover
// with four mutually-exclusive options (radio-style, first preselected).
//

export type WorkspaceAction = WorkspaceGitAction;

export type WorkspaceActionConfig = {
  selectedAction: WorkspaceAction;
  worktreeNameLabel: string;
  branchNameLabel: string;
  createWorktreeFrom: string;
  createBranchFrom: string;
  switchBranchTarget: string;
  switchWorktreeTarget: string;
};

export type WorkspaceActionPayload =
  | {
      type: 'create-worktree';
      worktreeName: string;
      sourceBranch: string;
    }
  | {
      type: 'switch-worktree';
      targetWorktreePath: string;
    }
  | {
      type: 'create-branch';
      branchName: string;
      sourceBranch: string;
    }
  | {
      type: 'switch-branch';
      targetBranch: string;
    };

export function toWorkspaceActionPayload(
  config: WorkspaceActionConfig,
): WorkspaceActionPayload {
  switch (config.selectedAction) {
    case 'create-worktree':
      return {
        type: 'create-worktree',
        worktreeName: config.worktreeNameLabel,
        sourceBranch: config.createWorktreeFrom,
      };
    case 'switch-worktree':
      return {
        type: 'switch-worktree',
        targetWorktreePath: config.switchWorktreeTarget,
      };
    case 'create-branch':
      return {
        type: 'create-branch',
        branchName: config.branchNameLabel,
        sourceBranch: config.createBranchFrom,
      };
    case 'switch-branch':
      return {
        type: 'switch-branch',
        targetBranch: config.switchBranchTarget,
      };
  }
}

type WorkspaceGitActionExecutor = {
  createWorkspaceGitWorktree: (
    agentInstanceId: string,
    mountPrefix: string,
    options: WorkspaceGitCreateWorktreeOptions,
  ) => Promise<WorkspaceGitCreateWorktreeResult>;
  createWorkspaceGitBranch: (
    agentInstanceId: string,
    mountPrefix: string,
    options: WorkspaceGitCreateBranchOptions,
  ) => Promise<WorkspaceGitMutationResult>;
  switchWorkspaceGitBranch: (
    agentInstanceId: string,
    mountPrefix: string,
    branchName: string,
  ) => Promise<WorkspaceGitMutationResult>;
  mountWorkspace: (
    agentInstanceId: string,
    workspacePath?: string,
  ) => Promise<void>;
  unmountWorkspace: (
    agentInstanceId: string,
    mountPrefix: string,
  ) => Promise<void>;
};

type WorkspaceGitActionByPathExecutor = {
  createGitWorktreeByPath: (
    workspacePath: string,
    options: WorkspaceGitCreateWorktreeOptions,
  ) => Promise<WorkspaceGitCreateWorktreeResult>;
  createGitBranchByPath: (
    workspacePath: string,
    options: WorkspaceGitCreateBranchOptions,
  ) => Promise<WorkspaceGitMutationResult>;
  switchGitBranchByPath: (
    workspacePath: string,
    branchName: string,
  ) => Promise<WorkspaceGitMutationResult>;
  mountWorkspace: (
    agentInstanceId: string,
    workspacePath?: string,
  ) => Promise<void>;
};

export type WorkspaceGitActionExecutionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function executeWorkspaceGitAction({
  agentInstanceId,
  mount,
  config,
  executor,
}: {
  agentInstanceId: string;
  mount: MountEntry;
  config: WorkspaceActionConfig;
  executor: WorkspaceGitActionExecutor;
}): Promise<WorkspaceGitActionExecutionResult> {
  const payload = toWorkspaceActionPayload(config);

  switch (payload.type) {
    case 'create-worktree': {
      const result = await executor.createWorkspaceGitWorktree(
        agentInstanceId,
        mount.prefix,
        {
          worktreeName: payload.worktreeName,
          sourceBranch: payload.sourceBranch,
        },
      );
      if (!result.ok) return { ok: false, message: result.message };
      await executor.mountWorkspace(agentInstanceId, result.path);
      await executor.unmountWorkspace(agentInstanceId, mount.prefix);
      return { ok: true };
    }
    case 'switch-worktree':
      if (payload.targetWorktreePath !== mount.path) {
        await executor.mountWorkspace(
          agentInstanceId,
          payload.targetWorktreePath,
        );
        await executor.unmountWorkspace(agentInstanceId, mount.prefix);
      }
      return { ok: true };
    case 'create-branch': {
      const result = await executor.createWorkspaceGitBranch(
        agentInstanceId,
        mount.prefix,
        {
          branchName: payload.branchName,
          sourceBranch: payload.sourceBranch,
        },
      );
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true };
    }
    case 'switch-branch': {
      const result = await executor.switchWorkspaceGitBranch(
        agentInstanceId,
        mount.prefix,
        payload.targetBranch,
      );
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true };
    }
  }
}

export async function executeWorkspaceGitActionByPath({
  agentInstanceId,
  workspacePath,
  config,
  executor,
}: {
  agentInstanceId: string;
  workspacePath: string;
  config: WorkspaceActionConfig;
  executor: WorkspaceGitActionByPathExecutor;
}): Promise<WorkspaceGitActionExecutionResult> {
  const payload = toWorkspaceActionPayload(config);

  switch (payload.type) {
    case 'create-worktree': {
      const result = await executor.createGitWorktreeByPath(workspacePath, {
        worktreeName: payload.worktreeName,
        sourceBranch: payload.sourceBranch,
      });
      if (!result.ok) return { ok: false, message: result.message };
      await executor.mountWorkspace(agentInstanceId, result.path);
      return { ok: true };
    }
    case 'switch-worktree':
      await executor.mountWorkspace(
        agentInstanceId,
        payload.targetWorktreePath,
      );
      return { ok: true };
    case 'create-branch': {
      const result = await executor.createGitBranchByPath(workspacePath, {
        branchName: payload.branchName,
        sourceBranch: payload.sourceBranch,
      });
      if (!result.ok) return { ok: false, message: result.message };
      await executor.mountWorkspace(agentInstanceId, workspacePath);
      return { ok: true };
    }
    case 'switch-branch': {
      const result = await executor.switchGitBranchByPath(
        workspacePath,
        payload.targetBranch,
      );
      if (!result.ok) return { ok: false, message: result.message };
      await executor.mountWorkspace(agentInstanceId, workspacePath);
      return { ok: true };
    }
  }
}

function getSelectItemTextValues(item: SelectItem<string>): string[] {
  return [item.value, item.label, item.triggerLabel].filter(
    (value): value is string => typeof value === 'string',
  );
}

function getWorktreeNameFromPath(value: string): string | null {
  return getBaseName(value) ?? null;
}

function getReservedWorkspaceActionNames(
  sourceBranchItems: SelectItem<string>[],
  worktreeItems: SelectItem<string>[],
  checkoutBranchItems: SelectItem<string>[] = sourceBranchItems,
): Set<string> {
  const reserved = new Set<string>();

  for (const item of [...sourceBranchItems, ...checkoutBranchItems]) {
    for (const value of getSelectItemTextValues(item)) {
      const trimmed = value?.trim();
      if (trimmed) reserved.add(trimmed);
    }
  }

  for (const item of worktreeItems) {
    for (const value of getSelectItemTextValues(item)) {
      const trimmed = value?.trim();
      if (!trimmed) continue;
      reserved.add(trimmed);
      const basename = getWorktreeNameFromPath(trimmed);
      if (basename) reserved.add(basename);
    }
  }

  return reserved;
}

export function createDefaultWorkspaceActionConfig(
  sourceBranchItems: SelectItem<string>[],
  worktreeItems: SelectItem<string>[],
  checkoutBranchItems: SelectItem<string>[] = sourceBranchItems,
  defaultBranch = 'main',
): WorkspaceActionConfig {
  const sourceBranchDefault =
    sourceBranchItems.find((item) => item.value === defaultBranch)?.value ??
    sourceBranchItems[0]?.value ??
    'main';
  const checkoutBranchDefault =
    checkoutBranchItems.find(
      (item) => item.value === defaultBranch && !item.disabled,
    )?.value ??
    checkoutBranchItems.find((item) => !item.disabled)?.value ??
    defaultBranch;
  const mainWorktreeDefault =
    worktreeItems.find((item) => item.value === defaultBranch)?.value ??
    worktreeItems[0]?.value ??
    defaultBranch;
  const reservedNames = getReservedWorkspaceActionNames(
    sourceBranchItems,
    worktreeItems,
    checkoutBranchItems,
  );

  const worktreeNameLabel =
    generateWorktreeName({
      reservedNames,
    }) ?? '';
  if (worktreeNameLabel) reservedNames.add(worktreeNameLabel);
  const branchNameLabel =
    generateWorktreeName({
      reservedNames,
    }) ?? '';

  return {
    selectedAction: 'create-worktree',
    worktreeNameLabel,
    branchNameLabel,
    createWorktreeFrom: sourceBranchDefault,
    createBranchFrom: sourceBranchDefault,
    switchBranchTarget: checkoutBranchDefault,
    switchWorktreeTarget: mainWorktreeDefault,
  };
}

function workspaceActionConfigsEqual(
  a: WorkspaceActionConfig,
  b: WorkspaceActionConfig,
): boolean {
  return (
    a.selectedAction === b.selectedAction &&
    a.worktreeNameLabel === b.worktreeNameLabel &&
    a.branchNameLabel === b.branchNameLabel &&
    a.createWorktreeFrom === b.createWorktreeFrom &&
    a.createBranchFrom === b.createBranchFrom &&
    a.switchBranchTarget === b.switchBranchTarget &&
    a.switchWorktreeTarget === b.switchWorktreeTarget
  );
}

export function hydrateWorkspaceActionConfigWithDefaults(
  config: WorkspaceActionConfig,
  defaults: WorkspaceActionConfig,
  previousDefaultBranch = 'main',
): WorkspaceActionConfig {
  return {
    ...config,
    createWorktreeFrom:
      config.createWorktreeFrom === previousDefaultBranch
        ? defaults.createWorktreeFrom
        : config.createWorktreeFrom,
    createBranchFrom:
      config.createBranchFrom === previousDefaultBranch
        ? defaults.createBranchFrom
        : config.createBranchFrom,
    switchBranchTarget:
      config.switchBranchTarget === previousDefaultBranch
        ? defaults.switchBranchTarget
        : config.switchBranchTarget,
    switchWorktreeTarget:
      config.switchWorktreeTarget === previousDefaultBranch
        ? defaults.switchWorktreeTarget
        : config.switchWorktreeTarget,
  };
}

type WorkspaceActionPickerContentProps = {
  config: WorkspaceActionConfig;
  sourceBranchItems: SelectItem<string>[];
  checkoutBranchItems: SelectItem<string>[];
  worktreeItems: SelectItem<string>[];
  branchSelectPortalContainer?: React.RefObject<HTMLElement | null>;
  onCommit: (action: WorkspaceAction) => void;
  onUpdateAction: (
    action: WorkspaceAction,
    partial: Partial<WorkspaceActionConfig>,
  ) => void;
};

function getWorkspaceActionValidationError(
  config: WorkspaceActionConfig,
  sourceBranchItems: SelectItem<string>[],
  checkoutBranchItems: SelectItem<string>[],
  worktreeItems: SelectItem<string>[],
): string | null {
  const existingBranches = new Set(sourceBranchItems.map((item) => item.value));
  const existingWorktreeNames = new Set<string>();
  for (const item of worktreeItems) {
    for (const value of getSelectItemTextValues(item)) {
      const trimmed = value?.trim();
      if (!trimmed) continue;
      existingWorktreeNames.add(trimmed);
      const basename = getWorktreeNameFromPath(trimmed);
      if (basename) existingWorktreeNames.add(basename);
    }
  }

  switch (config.selectedAction) {
    case 'create-worktree':
      if (config.worktreeNameLabel.trim().length === 0) {
        return 'Worktree name is required.';
      }
      if (existingBranches.has(config.worktreeNameLabel)) {
        return 'A branch with this name already exists.';
      }
      if (existingWorktreeNames.has(config.worktreeNameLabel)) {
        return 'A worktree with this name already exists.';
      }
      return null;
    case 'create-branch':
      if (config.branchNameLabel.trim().length === 0) {
        return 'Branch name is required.';
      }
      if (existingBranches.has(config.branchNameLabel)) {
        return 'A branch with this name already exists.';
      }
      return null;
    case 'switch-branch': {
      const target = checkoutBranchItems.find(
        (item) => item.value === config.switchBranchTarget,
      );
      if (!target) return 'Branch is unavailable.';
      if (target.disabled) return 'Branch is checked out in another worktree.';
      return null;
    }
    case 'switch-worktree':
      if (
        !worktreeItems.some(
          (item) => item.value === config.switchWorktreeTarget,
        )
      ) {
        return 'Worktree is unavailable.';
      }
      return null;
  }
}

function WorkspaceActionPickerContent({
  config,
  sourceBranchItems,
  checkoutBranchItems,
  worktreeItems,
  branchSelectPortalContainer,
  onCommit,
  onUpdateAction,
}: WorkspaceActionPickerContentProps) {
  const validationError = getWorkspaceActionValidationError(
    config,
    sourceBranchItems,
    checkoutBranchItems,
    worktreeItems,
  );

  return (
    <>
      <ActionGroupHeader>Worktree</ActionGroupHeader>

      <ActionRow
        active={config.selectedAction === 'create-worktree'}
        onSelect={() => onCommit('create-worktree')}
      >
        <span className="shrink-0 text-xs">Create worktree</span>
        <NameChip
          name={config.worktreeNameLabel}
          onCommit={(next) =>
            onUpdateAction('create-worktree', { worktreeNameLabel: next })
          }
        />
        <span className="shrink-0 text-xs">from</span>
        <ActionBranchSelect
          items={sourceBranchItems}
          value={config.createWorktreeFrom}
          onValueChange={(next) =>
            onUpdateAction('create-worktree', { createWorktreeFrom: next })
          }
          portalContainer={branchSelectPortalContainer}
        />
      </ActionRow>

      <ActionRow
        active={config.selectedAction === 'switch-worktree'}
        onSelect={() => onCommit('switch-worktree')}
      >
        <span className="shrink-0 text-xs">Use existing worktree</span>
        <ActionBranchSelect
          items={worktreeItems}
          value={config.switchWorktreeTarget}
          onValueChange={(next) =>
            onUpdateAction('switch-worktree', { switchWorktreeTarget: next })
          }
          icon="worktree"
          portalContainer={branchSelectPortalContainer}
        />
      </ActionRow>

      <ActionGroupHeader>Branch</ActionGroupHeader>

      <ActionRow
        active={config.selectedAction === 'create-branch'}
        onSelect={() => onCommit('create-branch')}
      >
        <span className="shrink-0 text-xs">Create branch</span>
        <NameChip
          name={config.branchNameLabel}
          onCommit={(next) =>
            onUpdateAction('create-branch', { branchNameLabel: next })
          }
        />
        <span className="shrink-0 text-xs">from</span>
        <ActionBranchSelect
          items={sourceBranchItems}
          value={config.createBranchFrom}
          onValueChange={(next) =>
            onUpdateAction('create-branch', { createBranchFrom: next })
          }
          portalContainer={branchSelectPortalContainer}
        />
      </ActionRow>

      <ActionRow
        active={config.selectedAction === 'switch-branch'}
        onSelect={() => onCommit('switch-branch')}
      >
        <span className="shrink-0 text-xs">Use existing branch</span>
        <ActionBranchSelect
          items={checkoutBranchItems}
          value={config.switchBranchTarget}
          onValueChange={(next) =>
            onUpdateAction('switch-branch', { switchBranchTarget: next })
          }
          portalContainer={branchSelectPortalContainer}
        />
      </ActionRow>

      {validationError && (
        <div className="px-2 pt-1 pb-1 text-subtle-foreground text-xs">
          {validationError}
        </div>
      )}
    </>
  );
}

const WorkspaceActionSelect = memo(function WorkspaceActionSelect({
  mount,
  onUnmount,
  config: controlledConfig,
  onConfigChange,
  agentInstanceId,
}: {
  mount: MountEntry;
  onUnmount: (prefix: string) => void;
  config?: WorkspaceActionConfig;
  onConfigChange?: (mount: MountEntry, config: WorkspaceActionConfig) => void;
  agentInstanceId: string;
}) {
  const track = useTrack();
  const name = getBaseName(mount.path) || mount.path;
  const gitRef = useMemo(
    () => (mount.git ? formatGitRef(mount.git) : null),
    [mount.git],
  );
  const listWorkspaceGitBranches = useKartonProcedure(
    (p) => p.toolbox.listWorkspaceGitBranches,
  );
  const listWorkspaceGitWorktrees = useKartonProcedure(
    (p) => p.toolbox.listWorkspaceGitWorktrees,
  );
  const createWorkspaceGitWorktree = useKartonProcedure(
    (p) => p.toolbox.createWorkspaceGitWorktree,
  );
  const createWorkspaceGitBranch = useKartonProcedure(
    (p) => p.toolbox.createWorkspaceGitBranch,
  );
  const switchWorkspaceGitBranch = useKartonProcedure(
    (p) => p.toolbox.switchWorkspaceGitBranch,
  );
  const mountWorkspace = useKartonProcedure((p) => p.toolbox.mountWorkspace);
  const unmountWorkspace = useKartonProcedure(
    (p) => p.toolbox.unmountWorkspace,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [branchesResult, setBranchesResult] =
    useState<WorkspaceGitBranchesResult | null>(null);
  const [worktreesResult, setWorktreesResult] =
    useState<WorkspaceGitWorktreesResult | null>(null);
  const [gitDataLoaded, setGitDataLoaded] = useState(false);

  const sourceBranchItems = useMemo(
    () => getBranchSelectItemsFromGit(branchesResult, gitRef, 'source'),
    [branchesResult, gitRef],
  );
  const checkoutBranchItems = useMemo(
    () =>
      getBranchSelectItemsFromGit(branchesResult, gitRef, 'checkout-target'),
    [branchesResult, gitRef],
  );
  const worktreeItems = useMemo(
    () => getWorktreeSelectItemsFromGit(worktreesResult),
    [worktreesResult],
  );
  const defaultBranch = useMemo(
    () => getDefaultBranchValue(branchesResult, gitRef),
    [branchesResult, gitRef],
  );
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const generalWorkspaceGitActionPreference = useKartonState(
    (s) => s.preferences.agent.workspaceGitActionPreferences.general,
  );
  const repositoryWorkspaceGitActionPreference = useKartonState((s) =>
    mount.git?.repositoryId
      ? s.preferences.agent.workspaceGitActionPreferences.repositories[
          mount.git.repositoryId
        ]
      : undefined,
  );

  const [open, setOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState(() =>
    applyWorkspaceGitActionPreferences(
      createDefaultWorkspaceActionConfig(
        sourceBranchItems,
        worktreeItems,
        checkoutBranchItems,
        defaultBranch,
      ),
      sourceBranchItems,
      generalWorkspaceGitActionPreference,
      repositoryWorkspaceGitActionPreference,
    ),
  );
  const config = controlledConfig ?? localConfig;

  const refreshGitData = useCallback(async () => {
    const [nextBranches, nextWorktrees] = await Promise.all([
      listWorkspaceGitBranches(agentInstanceId, mount.prefix),
      listWorkspaceGitWorktrees(agentInstanceId, mount.prefix),
    ]);
    setBranchesResult(nextBranches);
    setWorktreesResult(nextWorktrees);
    setGitDataLoaded(true);
  }, [
    agentInstanceId,
    listWorkspaceGitBranches,
    listWorkspaceGitWorktrees,
    mount.prefix,
  ]);

  useEffect(() => {
    if (!gitDataLoaded) return;

    const defaults = applyWorkspaceGitActionPreferences(
      createDefaultWorkspaceActionConfig(
        sourceBranchItems,
        worktreeItems,
        checkoutBranchItems,
        defaultBranch,
      ),
      sourceBranchItems,
      generalWorkspaceGitActionPreference,
      repositoryWorkspaceGitActionPreference,
    );
    const hydratedConfig = hydrateWorkspaceActionConfigWithDefaults(
      config,
      defaults,
    );
    if (workspaceActionConfigsEqual(config, hydratedConfig)) return;

    if (onConfigChange) {
      onConfigChange(mount, hydratedConfig);
    } else {
      setLocalConfig(hydratedConfig);
    }
  }, [
    checkoutBranchItems,
    config,
    defaultBranch,
    generalWorkspaceGitActionPreference,
    gitDataLoaded,
    mount,
    onConfigChange,
    repositoryWorkspaceGitActionPreference,
    sourceBranchItems,
    worktreeItems,
  ]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && !gitDataLoaded) {
        void refreshGitData();
      }
    },
    [gitDataLoaded, refreshGitData],
  );

  const persistWorkspaceGitActionPreference = useCallback(
    (next: WorkspaceAction, partial: Partial<WorkspaceActionConfig>) => {
      const repositoryId = mount.git?.repositoryId;
      const patches: Patch[] = [
        {
          op: 'add',
          path: [
            'agent',
            'workspaceGitActionPreferences',
            'general',
            'selectedAction',
          ],
          value: next,
        },
      ];

      if (repositoryId) {
        if (!repositoryWorkspaceGitActionPreference) {
          patches.push({
            op: 'add',
            path: [
              'agent',
              'workspaceGitActionPreferences',
              'repositories',
              repositoryId,
            ],
            value: {},
          });
        }
        patches.push({
          op: 'add',
          path: [
            'agent',
            'workspaceGitActionPreferences',
            'repositories',
            repositoryId,
            'selectedAction',
          ],
          value: next,
        });
        if (typeof partial.createWorktreeFrom === 'string') {
          patches.push({
            op: 'add',
            path: [
              'agent',
              'workspaceGitActionPreferences',
              'repositories',
              repositoryId,
              'createWorktreeFrom',
            ],
            value: partial.createWorktreeFrom,
          });
        }
        if (typeof partial.createBranchFrom === 'string') {
          patches.push({
            op: 'add',
            path: [
              'agent',
              'workspaceGitActionPreferences',
              'repositories',
              repositoryId,
              'createBranchFrom',
            ],
            value: partial.createBranchFrom,
          });
        }
      }

      void preferencesUpdate(patches);
    },
    [
      mount.git?.repositoryId,
      preferencesUpdate,
      repositoryWorkspaceGitActionPreference,
    ],
  );

  const handleActionUpdate = useCallback(
    (next: WorkspaceAction, partial: Partial<WorkspaceActionConfig>) => {
      const nextConfig = { ...config, ...partial, selectedAction: next };
      const validationError = getWorkspaceActionValidationError(
        nextConfig,
        sourceBranchItems,
        checkoutBranchItems,
        worktreeItems,
      );
      if (validationError) {
        setActionError(validationError);
        return;
      }
      setActionError(null);
      persistWorkspaceGitActionPreference(next, partial);
      if (onConfigChange) {
        onConfigChange(mount, nextConfig);
        setOpen(false);
      } else {
        setLocalConfig(nextConfig);
        void executeWorkspaceGitAction({
          agentInstanceId,
          mount,
          config: nextConfig,
          executor: {
            createWorkspaceGitWorktree,
            createWorkspaceGitBranch,
            switchWorkspaceGitBranch,
            mountWorkspace,
            unmountWorkspace,
          },
        }).then((result) => {
          if (!result.ok) {
            setActionError(result.message);
            return;
          }
          setOpen(false);
          setGitDataLoaded(false);
          void refreshGitData();
        });
      }
      track('workspace-action-changed', {
        mount_path: mount.path,
        action: next,
        action_payload: toWorkspaceActionPayload(nextConfig),
      });
    },
    [
      agentInstanceId,
      checkoutBranchItems,
      config,
      createWorkspaceGitBranch,
      createWorkspaceGitWorktree,
      mount,
      mountWorkspace,
      onConfigChange,
      persistWorkspaceGitActionPreference,
      refreshGitData,
      sourceBranchItems,
      switchWorkspaceGitBranch,
      track,
      unmountWorkspace,
      worktreeItems,
    ],
  );

  const handleActionChange = useCallback(
    (next: WorkspaceAction) => handleActionUpdate(next, {}),
    [handleActionUpdate],
  );

  const triggerSummary = useMemo<React.ReactNode>(() => {
    switch (config.selectedAction) {
      case 'create-worktree':
        return (
          <>
            create worktree{' '}
            <SummaryHighlight>{config.worktreeNameLabel}</SummaryHighlight> from{' '}
            <SummaryHighlight>{config.createWorktreeFrom}</SummaryHighlight>
          </>
        );
      case 'create-branch':
        return (
          <>
            create branch{' '}
            <SummaryHighlight>{config.branchNameLabel}</SummaryHighlight> from{' '}
            <SummaryHighlight>{config.createBranchFrom}</SummaryHighlight>
          </>
        );
      case 'switch-branch':
        return (
          <>
            use existing branch{' '}
            <SummaryHighlight>{config.switchBranchTarget}</SummaryHighlight>
          </>
        );
      case 'switch-worktree':
        return (
          <>
            use existing worktree{' '}
            <SummaryHighlight>
              {getSelectItemDisplayText(
                worktreeItems,
                config.switchWorktreeTarget,
              )}
            </SummaryHighlight>
          </>
        );
    }
  }, [config, worktreeItems]);

  const resolveAbsolute = useCallback((p: string) => p, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <FileContextMenu relativePath={mount.path} resolvePath={resolveAbsolute}>
        <div className="group/workspace flex max-w-96 cursor-default items-center justify-start gap-1.5 text-muted-foreground text-xs">
          <Tooltip>
            <TooltipTrigger>
              <span
                data-unmount
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onUnmount(mount.prefix);
                }}
                className="group/unmount relative flex size-4 shrink-0 cursor-pointer items-center justify-center"
              >
                {/*
                  Trigger icon mirrors the chosen action's domain so
                  the user can read the row at a glance: a worktree
                  icon for worktree actions, a branch icon for branch
                  actions. Both share the same hover-fade behavior
                  that swaps in the disconnect X.
                */}
                {config.selectedAction === 'create-worktree' ||
                config.selectedAction === 'switch-worktree' ? (
                  <IconBranchOutOutline18 className="size-3 shrink-0 group-hover/workspace:opacity-0" />
                ) : (
                  <IconCodeBranchOutline18 className="size-3 shrink-0 group-hover/workspace:opacity-0" />
                )}
                <IconXmarkFill18 className="absolute size-3.5 text-muted-foreground opacity-0 group-hover/unmount:text-foreground group-hover/workspace:opacity-100" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Disconnect workspace</TooltipContent>
          </Tooltip>
          <span className="shrink-0 truncate text-muted-foreground">
            {name}
          </span>
          <span
            aria-hidden
            className="shrink-0 select-none text-subtle-foreground"
          >
            &middot;
          </span>
          <PopoverTrigger>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'group/action flex min-w-0 justify-start gap-1.5 px-0',
                'text-muted-foreground hover:text-muted-foreground',
                'focus-visible:text-foreground',
                'has-[[data-popup-open]]:text-foreground',
              )}
            >
              <span className="min-w-0 truncate text-subtle-foreground group-hover/action:text-muted-foreground group-has-[[data-popup-open]]/action:text-muted-foreground">
                {triggerSummary}
              </span>
              <IconChevronDownFill18 className="size-3 shrink-0 text-subtle-foreground group-hover/action:text-muted-foreground group-has-[[data-popup-open]]/action:text-muted-foreground" />
            </Button>
          </PopoverTrigger>
        </div>
      </FileContextMenu>

      <PopoverBase.Portal>
        <PopoverBase.Backdrop
          className="pointer-events-auto fixed inset-0 z-40 size-full"
          onClick={(e) => e.stopPropagation()}
        />
        <PopoverBase.Positioner
          sideOffset={8}
          side="top"
          align="start"
          className="z-50"
        >
          <PopoverBase.Popup
            onClick={(e) => e.stopPropagation()}
            className={cn(
              // `group/rows` enables the cross-row "hover steals the
              // foreground color from the active row" behavior on
              // every `ActionRow` inside.
              'group/rows flex w-fit min-w-72 max-w-[28rem] flex-col gap-0 p-1',
              'rounded-lg bg-background ring-1 ring-border-subtle',
              'text-foreground shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'origin-(--transform-origin)',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            <WorkspaceActionPickerContent
              config={config}
              sourceBranchItems={sourceBranchItems}
              checkoutBranchItems={checkoutBranchItems}
              worktreeItems={worktreeItems}
              onCommit={handleActionChange}
              onUpdateAction={handleActionUpdate}
            />
            {actionError && (
              <div className="px-2 pt-1 pb-1 text-error-foreground text-xs">
                {actionError}
              </div>
            )}
          </PopoverBase.Popup>
        </PopoverBase.Positioner>
      </PopoverBase.Portal>
    </Popover>
  );
});

// Group header inside the workspace action popover. Mirrors the
// agents-list group header styling (subtle-foreground, semibold xs).
function ActionGroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 px-2 pt-2 pb-0.5 font-semibold text-subtle-foreground text-xs first:pt-1">
      {children}
    </div>
  );
}

// Inline highlight inside the workspace action trigger summary. Default
// rests at `text-muted-foreground` so the trigger reads as a subdued
// preview; it lifts to `text-foreground` only when the trigger row is
// hovered/focused or the popover is open.
function SummaryHighlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground group-hover/action:text-foreground group-focus-visible/action:text-foreground group-has-[[data-popup-open]]/action:text-foreground">
      {children}
    </span>
  );
}

// Single radio-style row inside the workspace action popover. The whole row
// is the click target; embedded interactive controls (Selects) sit inside
// and bubble their click up so picking inside an inactive row's Select
// also activates that row.
function ActionRow({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={active}
      tabIndex={0}
      data-action-row=""
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        // Keep rows adjacent in layout so crossing from one row to the next
        // never leaves all `[data-action-row]` hitboxes. The active row's
        // highlight is muted while another row is hovered; parent `gap` would
        // create a dead zone where the active row briefly re-highlights.
        'flex min-h-6 items-center gap-1.5 rounded-md px-2 py-0.5',
        // Color rules:
        //   – base rest: muted
        //   – active rest: foreground (the "selected" row reads as the
        //     current choice)
        //   – any row hovered: foreground (the hovered row "steals" it)
        //   – active + a sibling hovered: muted (the active row gives
        //     up its foreground while a different row is being
        //     considered). A self-hovered active row keeps the same
        //     foreground hover treatment as every other row.
        // Requires the wrapping popup to carry `group/rows`.
        'text-muted-foreground hover:text-foreground',
        'data-[active]:text-foreground',
        'group-has-[[data-action-row]:hover]/rows:data-[active]:text-muted-foreground',
        'data-[active]:hover:!text-foreground',
        'hover:bg-hover-derived focus-visible:bg-hover-derived focus-visible:outline-none',
        // Unselected rows are actionable — pointer cursor. The selected
        // row is already the current choice; default cursor signals that
        // clicking it again is a no-op.
        active ? 'cursor-default bg-hover-derived' : 'cursor-pointer',
      )}
      data-active={active ? '' : undefined}
    >
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center"
      >
        {active && <IconCheckFill18 className="size-full" />}
      </span>
      {children}
    </div>
  );
}

/**
 * Editable name chip rendered as a real `<input>` so the user gets a
 * visible "this is editable" affordance (subtle box + caret) without
 * breaking the row's compact rhythm. Width tracks the value via `ch`
 * units so the input is only as wide as the text it holds.
 */
function NameChip({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(name);

  // Keep local draft in sync with external updates (e.g. when the
  // parent regenerates the suggested name).
  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next.length > 0 && next !== name) {
      onCommit(next);
    } else {
      setDraft(name);
    }
  }, [draft, name, onCommit]);

  // Auto-size the input to its value by overlaying it on top of an
  // invisible span that mirrors the text. The grid track collapses to
  // the span's intrinsic width, then the input stretches to fill it.
  // This is more reliable across fonts than `field-sizing: content` /
  // `ch` units (which use the "0" character width and over-shoot for
  // narrow letters like "i" / "l").
  return (
    <span
      className="mx-0.5 inline-grid h-5 min-w-12 max-w-40 shrink-0 align-middle"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 whitespace-pre rounded px-1.5 py-0 font-normal text-xs leading-none"
      >
        {draft || '\u00A0'}
      </span>
      <input
        type="text"
        value={draft}
        // `size={1}` neutralises the input's default intrinsic width
        // (which is derived from the `size` attribute, default 20).
        // Without this, the auto grid track sizes to that 20-char
        // intrinsic width and ignores the mirror span.
        size={1}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(name);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={cn(
          'col-start-1 row-start-1 size-full min-w-0 rounded bg-surface-1 px-1.5 py-0',
          'font-normal text-foreground text-xs leading-none',
          'outline-none ring-1 ring-border-subtle transition-shadow',
          'focus:ring-border-derived',
        )}
      />
    </span>
  );
}

function getSelectItemDisplayText(
  items: SelectItem<string>[],
  value: string,
): React.ReactNode {
  const item = items.find((candidate) => candidate.value === value);
  return item?.triggerLabel ?? item?.label ?? value;
}

function ActionBranchSelect({
  items,
  value,
  onValueChange,
  icon = 'branch',
  portalContainer,
  onPopupMouseEnter,
  onPopupMouseLeave,
  onPopupOpenChange,
}: {
  items: SelectItem<string>[];
  value: string;
  onValueChange: (v: string) => void;
  icon?: 'branch' | 'worktree';
  portalContainer?: React.RefObject<HTMLElement | null>;
  onPopupMouseEnter?: () => void;
  onPopupMouseLeave?: () => void;
  onPopupOpenChange?: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack =
        typeof item.label === 'string' ? item.label : String(item.value);
      return haystack.toLowerCase().includes(needle);
    });
  }, [items, query]);

  const handleValueChange = useCallback(
    (next: string | null) => {
      if (next != null) onValueChange(next);
    },
    [onValueChange],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onPopupOpenChange?.(open);
      if (!open) setQuery('');
    },
    [onPopupOpenChange],
  );

  return (
    <span
      className="ml-1 shrink-0"
      // Stop popover-row clicks from re-firing when interacting with
      // the combobox trigger / chevron.
      onClick={(e) => e.stopPropagation()}
    >
      <Combobox
        value={value}
        onValueChange={handleValueChange}
        onOpenChange={handleOpenChange}
        filter={null}
      >
        <ComboboxBase.Trigger
          className={cn(
            'inline-flex h-5 cursor-pointer items-center gap-1 rounded p-0 font-normal text-xs shadow-none',
            'focus-visible:outline-1 focus-visible:outline-muted-foreground/35 focus-visible:-outline-offset-2',
            'bg-transparent text-muted-foreground hover:text-foreground data-popup-open:text-foreground',
          )}
        >
          {icon === 'worktree' ? (
            <IconBranchOutOutline18 className="size-3 shrink-0" />
          ) : (
            <IconCodeBranchOutline18 className="size-3 shrink-0" />
          )}
          <span className="truncate">
            {getSelectItemDisplayText(items, value)}
          </span>
          <ComboboxBase.Icon className="shrink-0">
            <IconChevronDownFill18 className="size-3" />
          </ComboboxBase.Icon>
        </ComboboxBase.Trigger>

        <ComboboxBase.Portal container={portalContainer}>
          <ComboboxBase.Backdrop className="fixed inset-0 z-50" />
          <ComboboxBase.Positioner
            side="bottom"
            sideOffset={4}
            align="start"
            className="z-50"
          >
            <ComboboxBase.Popup
              onMouseEnter={onPopupMouseEnter}
              onMouseLeave={onPopupMouseLeave}
              // This popup is rendered in a portal. React events from
              // portals still bubble through the React tree, so a click
              // on a ComboboxItem would otherwise reach the enclosing
              // ActionRow and trigger its commit/close handler.
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'flex w-72 max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col gap-0.5 text-xs',
                'rounded-lg border border-border-subtle bg-background p-1 shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'data-ending-style:scale-90 data-ending-style:opacity-0',
                'data-starting-style:scale-90 data-starting-style:opacity-0',
              )}
            >
              <div className="mb-1 rounded-md">
                <ComboboxInput
                  size="xs"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ComboboxList className="scrollbar-subtle max-h-48 min-w-0 overflow-y-auto">
                {filtered.map((item) => {
                  const label =
                    typeof item.label === 'string'
                      ? item.label
                      : String(item.value);
                  const isSelected = item.value === value;
                  return (
                    <ComboboxItem
                      key={String(item.value)}
                      value={item.value}
                      size="xs"
                      disabled={item.disabled}
                      // Selected item: already the current value, so a
                      // default cursor signals "no-op". Other rows are
                      // actionable — keep the pointer cursor.
                      className={cn(
                        'min-h-6 text-xs leading-4',
                        isSelected ? 'cursor-default' : 'cursor-pointer',
                      )}
                    >
                      <ComboboxItemIndicator />
                      <span className="col-start-2 min-w-0 truncate">
                        {label}
                      </span>
                    </ComboboxItem>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-2 py-1.5 text-muted-foreground text-xs">
                    No results
                  </div>
                )}
              </ComboboxList>
            </ComboboxBase.Popup>
          </ComboboxBase.Positioner>
        </ComboboxBase.Portal>
      </Combobox>
    </span>
  );
}

// ============================================================================
// Connect workspace popover
// ============================================================================
//
// Replaces the legacy flat `Select` connect popover with a custom popover.
// Recent workspace rows expose an inline action selector; clicking the parent
// row commits whichever action is selected for that row. Empty-chat recent
// connects mount the workspace and defer the selected action into the
// below-input action selector. Post-message recent connects execute the
// selected action immediately by path. Connect-new remains picker-first because
// there is no path until the native picker resolves.

// Per-row action configuration. Each recent path (and the literal
// `__new__` row) gets its own entry so configuration is preserved while the
// popover is open. The map is reset whenever the popover closes.
type ConnectActionState = WorkspaceActionConfig;

const CONNECT_NEW_KEY = '__new__';

function ConnectActionSummary({ state }: { state: ConnectActionState }) {
  switch (state.selectedAction) {
    case 'create-worktree':
      return <>Create new worktree</>;
    case 'switch-worktree':
      return <>Use worktree</>;
    case 'create-branch':
      return <>Create new branch</>;
    case 'switch-branch':
      return <>Use branch</>;
  }
}

type ConnectGitOptions = {
  sourceBranchItems: SelectItem<string>[];
  checkoutBranchItems: SelectItem<string>[];
  worktreeItems: SelectItem<string>[];
  defaultBranch: string;
};

type ConnectPathGitCapability = 'unknown' | 'loading' | 'git' | 'not-git';

type ConnectInlineActionSelectProps = {
  state: ConnectActionState;
  sourceBranchItems: SelectItem<string>[];
  checkoutBranchItems: SelectItem<string>[];
  worktreeItems: SelectItem<string>[];
  onOpen?: () => void;
  onUpdate: (partial: Partial<ConnectActionState>) => void;
};

function ConnectInlineActionSelect({
  state,
  sourceBranchItems,
  checkoutBranchItems,
  worktreeItems,
  onOpen,
  onUpdate,
}: ConnectInlineActionSelectProps) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleActionUpdate = useCallback(
    (selectedAction: WorkspaceAction, partial: Partial<ConnectActionState>) => {
      onUpdate({ ...partial, selectedAction });
      setOpen(false);
    },
    [onUpdate],
  );

  const handleSelect = useCallback(
    (selectedAction: WorkspaceAction) => {
      handleActionUpdate(selectedAction, {});
    },
    [handleActionUpdate],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) onOpen?.();
    },
    [onOpen],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'group/connect-action inline-flex min-w-0 max-w-full cursor-pointer items-baseline gap-1 rounded p-0 font-normal text-muted-foreground text-xs shadow-none',
            'bg-transparent hover:text-foreground',
            'focus-visible:outline-1 focus-visible:outline-muted-foreground/35 focus-visible:-outline-offset-2 data-popup-open:text-foreground',
          )}
        >
          <span className="min-w-0 truncate whitespace-nowrap">
            <ConnectActionSummary state={state} />
          </span>
          <IconChevronDownFill18 className="size-3 shrink-0 self-center text-muted-foreground group-hover/connect-action:text-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverBase.Portal>
        <PopoverBase.Backdrop
          className="pointer-events-auto fixed inset-0 z-50"
          // The nested action picker lives inside a clickable recent-workspace
          // row. Portal events still bubble through the React tree, so outside
          // clicks on this backdrop must close only the nested picker and must
          // not reach the parent row where they would commit/connect it.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <PopoverBase.Positioner
          side="top"
          sideOffset={8}
          align="end"
          className="z-50"
        >
          <PopoverBase.Popup
            ref={popupRef}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'group/rows flex w-fit min-w-72 max-w-[28rem] flex-col gap-0 p-1',
              'rounded-lg bg-background ring-1 ring-border-subtle',
              'text-foreground shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'origin-(--transform-origin)',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            <WorkspaceActionPickerContent
              config={state}
              sourceBranchItems={sourceBranchItems}
              checkoutBranchItems={checkoutBranchItems}
              worktreeItems={worktreeItems}
              branchSelectPortalContainer={popupRef}
              onCommit={handleSelect}
              onUpdateAction={handleActionUpdate}
            />
          </PopoverBase.Popup>
        </PopoverBase.Positioner>
      </PopoverBase.Portal>
    </Popover>
  );
}

type ConnectMountResult = { ok: true } | { ok: false; message: string };

type ConnectWorkspaceSelectProps = {
  hasMounts: boolean;
  recentPaths: ReadonlyArray<{
    path: string;
    name: string;
    openedAt: number;
  }>;
  onMount: (
    path: string | undefined,
    config: ConnectActionState | null,
  ) => Promise<ConnectMountResult>;
};

const ConnectWorkspaceSelect = memo(function ConnectWorkspaceSelectInner({
  hasMounts,
  recentPaths,
  onMount,
}: ConnectWorkspaceSelectProps) {
  const track = useTrack();
  const listGitBranchesByPath = useKartonProcedure(
    (p) => p.toolbox.listGitBranchesByPath,
  );
  const listGitWorktreesByPath = useKartonProcedure(
    (p) => p.toolbox.listGitWorktreesByPath,
  );
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const workspaceGitActionGeneralPreference = useKartonState(
    (s) => s.preferences.agent.workspaceGitActionPreferences.general,
  );
  const fallbackBranchItems = useMemo(() => getBranchSelectItems(null), []);
  const fallbackWorktreeItems = useMemo(() => getWorktreeSelectItems(), []);

  const createPreferredDefaultConfig = useCallback(
    (
      sourceBranchItems: SelectItem<string>[],
      worktreeItems: SelectItem<string>[],
      checkoutBranchItems: SelectItem<string>[] = sourceBranchItems,
      defaultBranch?: string,
    ) =>
      applyWorkspaceGitActionPreferences(
        createDefaultWorkspaceActionConfig(
          sourceBranchItems,
          worktreeItems,
          checkoutBranchItems,
          defaultBranch,
        ),
        sourceBranchItems,
        workspaceGitActionGeneralPreference,
      ),
    [workspaceGitActionGeneralPreference],
  );

  const persistGeneralWorkspaceGitActionPreference = useCallback(
    (selectedAction: WorkspaceAction) => {
      void preferencesUpdate([
        {
          op: 'add',
          path: [
            'agent',
            'workspaceGitActionPreferences',
            'general',
            'selectedAction',
          ],
          value: selectedAction,
        },
      ]);
    },
    [preferencesUpdate],
  );

  const [open, setOpen] = useState(false);
  const [pathGitOptions, setPathGitOptions] = useState<
    ReadonlyMap<string, ConnectGitOptions>
  >(() => new Map());
  const [pathGitCapability, setPathGitCapability] = useState<
    ReadonlyMap<string, ConnectPathGitCapability>
  >(() => new Map());
  const [pathStates, setPathStates] = useState<
    ReadonlyMap<string, ConnectActionState>
  >(() => new Map());
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingRowKey, setPendingRowKey] = useState<string | null>(null);
  const recentListScrollRef = useRef<HTMLDivElement>(null);
  const { maskStyle: recentListMaskStyle } = useScrollFadeMask(
    recentListScrollRef,
    {
      axis: 'vertical',
      fadeDistances: { bottom: 28 },
    },
  );

  const getOrInitState = useCallback(
    (rowKey: string): ConnectActionState => {
      const existing = pathStates.get(rowKey);
      if (existing) return existing;
      const next = createPreferredDefaultConfig(
        fallbackBranchItems,
        fallbackWorktreeItems,
      );
      setPathStates((prev) => {
        if (prev.has(rowKey)) return prev;
        const map = new Map(prev);
        map.set(rowKey, next);
        return map;
      });
      return next;
    },
    [
      pathStates,
      fallbackBranchItems,
      fallbackWorktreeItems,
      createPreferredDefaultConfig,
    ],
  );

  const updateRowState = useCallback(
    (rowKey: string, partial: Partial<ConnectActionState>) => {
      setPathStates((prev) => {
        const map = new Map(prev);
        const current =
          map.get(rowKey) ??
          createPreferredDefaultConfig(
            fallbackBranchItems,
            fallbackWorktreeItems,
          );
        map.set(rowKey, { ...current, ...partial });
        return map;
      });
    },
    [fallbackBranchItems, fallbackWorktreeItems, createPreferredDefaultConfig],
  );

  const initializePathStates = useCallback(() => {
    setPathStates((prev) => {
      const map = new Map(prev);
      let changed = false;

      for (const workspace of recentPaths) {
        const rowKey = `workspace:${workspace.path}`;
        if (!map.has(rowKey)) {
          map.set(
            rowKey,
            createPreferredDefaultConfig(
              fallbackBranchItems,
              fallbackWorktreeItems,
            ),
          );
          changed = true;
        }
      }

      if (!map.has(CONNECT_NEW_KEY)) {
        map.set(
          CONNECT_NEW_KEY,
          createPreferredDefaultConfig(
            fallbackBranchItems,
            fallbackWorktreeItems,
          ),
        );
        changed = true;
      }

      return changed ? map : prev;
    });
  }, [
    fallbackBranchItems,
    fallbackWorktreeItems,
    recentPaths,
    createPreferredDefaultConfig,
  ]);

  const loadGitOptionsForPath = useCallback(
    async (
      workspacePath: string,
      rowKey: string,
    ): Promise<ConnectGitOptions | null> => {
      const cached = pathGitOptions.get(workspacePath);
      if (cached) return cached;

      setPathGitCapability((prev) => {
        if (prev.get(workspacePath) === 'loading') return prev;
        const next = new Map(prev);
        next.set(workspacePath, 'loading');
        return next;
      });

      let branchesResult: Awaited<ReturnType<typeof listGitBranchesByPath>>;
      let worktreesResult: Awaited<ReturnType<typeof listGitWorktreesByPath>>;
      try {
        [branchesResult, worktreesResult] = await Promise.all([
          listGitBranchesByPath(workspacePath),
          listGitWorktreesByPath(workspacePath),
        ]);
      } catch {
        setPathGitCapability((prev) => {
          const next = new Map(prev);
          next.set(workspacePath, 'not-git');
          return next;
        });
        return null;
      }

      if (!branchesResult || !worktreesResult) {
        setPathGitCapability((prev) => {
          const next = new Map(prev);
          next.set(workspacePath, 'not-git');
          return next;
        });
        return null;
      }

      const sourceBranchItems = getBranchSelectItemsFromGit(
        branchesResult,
        null,
        'source',
      );
      const checkoutBranchItems = getBranchSelectItemsFromGit(
        branchesResult,
        null,
        'checkout-target',
      );
      const worktreeItems = getWorktreeSelectItemsFromGit(worktreesResult);
      const defaultBranch = getDefaultBranchValue(branchesResult, null);
      const options = {
        sourceBranchItems,
        checkoutBranchItems,
        worktreeItems,
        defaultBranch,
      };
      setPathGitOptions((prev) => {
        if (prev.has(workspacePath)) return prev;
        const next = new Map(prev);
        next.set(workspacePath, options);
        return next;
      });
      setPathGitCapability((prev) => {
        const next = new Map(prev);
        next.set(workspacePath, 'git');
        return next;
      });
      setPathStates((prev) => {
        const current = prev.get(rowKey);
        if (!current) return prev;

        const defaults = createPreferredDefaultConfig(
          sourceBranchItems,
          worktreeItems,
          checkoutBranchItems,
          defaultBranch,
        );
        const sourceBranchValues = new Set(
          sourceBranchItems.map((item) => item.value),
        );
        const checkoutBranchValues = new Set(
          checkoutBranchItems.map((item) => item.value),
        );
        const worktreeValues = new Set(worktreeItems.map((item) => item.value));
        const hydrated = hydrateWorkspaceActionConfigWithDefaults(
          current,
          defaults,
        );
        const next = new Map(prev);
        next.set(rowKey, {
          ...hydrated,
          createWorktreeFrom: sourceBranchValues.has(
            hydrated.createWorktreeFrom,
          )
            ? hydrated.createWorktreeFrom
            : defaults.createWorktreeFrom,
          createBranchFrom: sourceBranchValues.has(hydrated.createBranchFrom)
            ? hydrated.createBranchFrom
            : defaults.createBranchFrom,
          switchBranchTarget: checkoutBranchValues.has(
            hydrated.switchBranchTarget,
          )
            ? hydrated.switchBranchTarget
            : defaults.switchBranchTarget,
          switchWorktreeTarget: worktreeValues.has(
            hydrated.switchWorktreeTarget,
          )
            ? hydrated.switchWorktreeTarget
            : defaults.switchWorktreeTarget,
        });
        return next;
      });
      return options;
    },
    [
      createPreferredDefaultConfig,
      listGitBranchesByPath,
      listGitWorktreesByPath,
      pathGitOptions,
    ],
  );

  const commitConnect = useCallback(
    async (rowKey: string, state: ConnectActionState) => {
      if (pendingRowKey) return;

      const source = rowKey === CONNECT_NEW_KEY ? 'picker' : 'recent';
      track('workspace-connect-action-chosen', {
        action: state.selectedAction,
        action_payload: toWorkspaceActionPayload(state),
        source,
      });
      const path =
        rowKey === CONNECT_NEW_KEY
          ? undefined
          : rowKey.replace('workspace:', '');
      const gitOptions =
        path === undefined ? null : await loadGitOptionsForPath(path, rowKey);
      if (path === undefined || gitOptions) {
        persistGeneralWorkspaceGitActionPreference(state.selectedAction);
      }
      const config =
        path === undefined
          ? state
          : gitOptions
            ? hydrateWorkspaceActionConfigWithDefaults(
                state,
                createDefaultWorkspaceActionConfig(
                  gitOptions.sourceBranchItems,
                  gitOptions.worktreeItems,
                  gitOptions.checkoutBranchItems,
                  gitOptions.defaultBranch,
                ),
              )
            : null;

      setConnectError(null);
      setPendingRowKey(rowKey);
      const result = await onMount(path, config);
      setPendingRowKey(null);

      if (!result.ok) {
        setConnectError(result.message);
        return;
      }

      setOpen(false);
    },
    [
      loadGitOptionsForPath,
      onMount,
      pendingRowKey,
      persistGeneralWorkspaceGitActionPreference,
      track,
    ],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setConnectError(null);
        initializePathStates();
        for (const workspace of recentPaths) {
          const rowKey = `workspace:${workspace.path}`;
          void loadGitOptionsForPath(workspace.path, rowKey);
        }
        return;
      }

      // Reset transient state on close so each open is a fresh
      // decision.
      setConnectError(null);
      setPendingRowKey(null);
      setPathStates(new Map());
      setPathGitOptions(new Map());
      setPathGitCapability(new Map());
    },
    [initializePathStates, loadGitOptionsForPath, recentPaths],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        {/*
          PopoverTrigger uses Base UI's `render` prop and forwards the
          trigger's button-like behavior onto its single child. Wrapping
          the Button in a Tooltip breaks that contract — the popover
          never gets wired to the actual Button. The previous tooltip
          ("Give the agent access to your files.") is dropped here;
          the with-label variant is self-explanatory, and the icon-only
          variant can grow a tooltip later via a different pattern.
        */}
        {hasMounts ? (
          <Button
            variant="ghost"
            size="xs"
            aria-label="Connect workspace"
            className="h-6 shrink-0 px-0 text-muted-foreground hover:text-foreground"
          >
            <IconFolder5Outline18 className="size-3 shrink-0" />
            <IconPlusFill18 className="size-2.5 shrink-0" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 shrink-0 px-0 text-muted-foreground hover:text-foreground"
          >
            <IconFolder5Outline18 className="size-3 shrink-0" />
            <span>Connect workspace</span>
            <IconPlusFill18 className="size-3 shrink-0" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverBase.Portal>
        <PopoverBase.Backdrop
          className="pointer-events-auto fixed inset-0 z-40 size-full"
          onClick={(e) => e.stopPropagation()}
        />
        <PopoverBase.Positioner
          sideOffset={8}
          side="top"
          align="start"
          className="z-50"
        >
          <PopoverBase.Popup
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'group/connect-list flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 p-1',
              'rounded-lg bg-background ring-1 ring-border-subtle',
              'text-foreground shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'origin-(--transform-origin)',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            {recentPaths.length > 0 && (
              <div className="px-2 pt-1 pb-1 font-semibold text-subtle-foreground text-xs">
                Recent workspaces
              </div>
            )}
            {recentPaths.length > 0 && (
              <div
                ref={recentListScrollRef}
                className="mask-alpha scrollbar-subtle max-h-[8.75rem] overflow-y-auto"
                style={recentListMaskStyle}
              >
                {recentPaths.map((workspace, index) => {
                  const rowKey = `workspace:${workspace.path}`;
                  const rowState =
                    pathStates.get(rowKey) ??
                    createPreferredDefaultConfig(
                      fallbackBranchItems,
                      fallbackWorktreeItems,
                    );
                  const gitOptions = pathGitOptions.get(workspace.path);
                  const gitCapability =
                    pathGitCapability.get(workspace.path) ?? 'unknown';
                  const sourceBranchItems =
                    gitOptions?.sourceBranchItems ?? fallbackBranchItems;
                  const checkoutBranchItems =
                    gitOptions?.checkoutBranchItems ?? fallbackBranchItems;
                  const worktreeItems =
                    gitOptions?.worktreeItems ?? fallbackWorktreeItems;
                  return (
                    <div
                      key={rowKey}
                      role="button"
                      tabIndex={0}
                      data-connect-row=""
                      onClick={(e) => {
                        e.stopPropagation();
                        // Parent-row click commits whichever action is
                        // currently selected in the inline action select
                        // for this row (defaults to `create-worktree`).
                        const state = getOrInitState(rowKey);
                        void commitConnect(rowKey, state);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const state = getOrInitState(rowKey);
                          void commitConnect(rowKey, state);
                        }
                      }}
                      className={cn(
                        'group/connect-row relative flex w-full cursor-pointer flex-col rounded-md px-2.5 py-1.5 text-left text-foreground text-xs',
                        'hover:bg-hover-derived',
                        'focus-visible:bg-hover-derived focus-visible:outline-none',
                      )}
                    >
                      <div className="flex min-w-0 items-baseline">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {workspace.name}
                        </span>
                        <span
                          className={cn(
                            'flex shrink-0 text-subtle-foreground transition-opacity group-hover/connect-row:text-muted-foreground',
                            'group-hover/connect-row:!pointer-events-auto group-hover/connect-row:!opacity-100',
                            'has-[[data-popup-open]]:!pointer-events-auto has-[[data-popup-open]]:!opacity-100',
                            index === 0
                              ? 'pointer-events-auto opacity-100 group-has-[[data-connect-row]:hover]/connect-list:pointer-events-none group-has-[[data-connect-row]:hover]/connect-list:opacity-0'
                              : 'pointer-events-none opacity-0',
                          )}
                        >
                          {gitCapability === 'git' && (
                            <ConnectInlineActionSelect
                              state={rowState}
                              sourceBranchItems={sourceBranchItems}
                              checkoutBranchItems={checkoutBranchItems}
                              worktreeItems={worktreeItems}
                              onOpen={() =>
                                void loadGitOptionsForPath(
                                  workspace.path,
                                  rowKey,
                                )
                              }
                              onUpdate={(partial) =>
                                updateRowState(rowKey, partial)
                              }
                            />
                          )}
                        </span>
                      </div>
                      <span
                        className="truncate text-subtle-foreground text-xs leading-normal"
                        dir="rtl"
                      >
                        <span dir="ltr">{workspace.path}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {connectError && (
              <div className="px-2.5 py-1 text-error-foreground text-xs">
                {connectError}
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const state = getOrInitState(CONNECT_NEW_KEY);
                void commitConnect(CONNECT_NEW_KEY, state);
              }}
              disabled={pendingRowKey !== null}
              className={cn(
                'group/connect-row flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-foreground text-xs',
                'hover:bg-hover-derived',
                'focus-visible:bg-hover-derived focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <IconPlusFill18 className="size-3.5 shrink-0" />
              <span>Connect new workspace</span>
            </button>
          </PopoverBase.Popup>
        </PopoverBase.Positioner>
      </PopoverBase.Portal>
    </Popover>
  );
});

// ============================================================================
// Workspace strip
// ============================================================================

interface WorkspaceSelectProps {
  onWorkspaceChange?: () => void;
  /**
   * When true (chat history is empty), each git-rooted workspace badge is
   * replaced by a `WorkspaceActionSelect` combined trigger that exposes a
   * worktree/branch action picker for the upcoming message.
   */
  chatIsEmpty: boolean;
  workspaceActionConfigs?: ReadonlyMap<string, WorkspaceActionConfig>;
  onWorkspaceActionConfigChange?: (
    mount: MountEntry,
    config: WorkspaceActionConfig,
  ) => void;
}

export const WorkspaceSelect = memo(function WorkspaceSelect({
  onWorkspaceChange,
  chatIsEmpty,
  workspaceActionConfigs,
  onWorkspaceActionConfigChange,
}: WorkspaceSelectProps) {
  const [openAgent] = useOpenAgent();

  const recentlyOpenedWorkspaces = useKartonState(
    (s) => s.userExperience.storedExperienceData.recentlyOpenedWorkspaces,
  );
  const mountWorkspace = useKartonProcedure((p) => p.toolbox.mountWorkspace);
  const createGitWorktreeByPath = useKartonProcedure(
    (p) => p.toolbox.createGitWorktreeByPath,
  );
  const createGitBranchByPath = useKartonProcedure(
    (p) => p.toolbox.createGitBranchByPath,
  );
  const switchGitBranchByPath = useKartonProcedure(
    (p) => p.toolbox.switchGitBranchByPath,
  );
  const unmountWorkspace = useKartonProcedure(
    (p) => p.toolbox.unmountWorkspace,
  );
  const track = useTrack();
  const allMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );
  const mountedPaths = useMemo(
    () => new Set(allMounts.map((mount) => mount.path)),
    [allMounts],
  );
  const pendingConnectActionConfigsRef = useRef<
    Array<{
      id: number;
      path: string | undefined;
      config: WorkspaceActionConfig;
      previousPrefixes: ReadonlySet<string>;
    }>
  >([]);
  const pendingConnectActionIdRef = useRef(0);

  // Live ref of the mount count. We assign it during render so callbacks can
  // read the latest count after mountWorkspace() resolves without stale state.
  const allMountsCountRef = useRef(allMounts.length);
  allMountsCountRef.current = allMounts.length;

  const trackMountOutcome = useCallback(
    async (
      promise: Promise<void>,
      source: 'picker' | 'recent-workspace',
    ): Promise<boolean> => {
      const before = allMountsCountRef.current;
      try {
        await promise;
      } catch {
        track('workspace-connect-failed', { source });
        return false;
      }
      // A mount is considered successful if the count grew. If it stayed the
      // same and the user went through the picker, they closed it without
      // selecting. The recent-workspace path cannot be aborted the same way,
      // so we only track an abort for the picker case.
      if (allMountsCountRef.current > before) {
        track('workspace-connect-finished');
        return true;
      }
      if (source === 'picker') {
        track('workspace-connect-aborted', { reason: 'picker-closed' });
      }
      return false;
    },
    [track],
  );

  const hasMounts = allMounts.length > 0;

  const recentPaths = useMemo(
    () =>
      [...recentlyOpenedWorkspaces]
        .filter((w) => !mountedPaths.has(w.path))
        .sort((a, b) => b.openedAt - a.openedAt),
    [recentlyOpenedWorkspaces, mountedPaths],
  );

  const handleMount = useCallback(
    async (
      path: string | undefined,
      config: WorkspaceActionConfig | null,
    ): Promise<ConnectMountResult> => {
      if (!openAgent) return { ok: false, message: 'No active agent.' };
      // Guard against mounting an already-mounted recent. The connect
      // popover already filters mounted paths out, but a stale
      // pathStates entry could conceivably reference one.
      if (path !== undefined && mountedPaths.has(path)) {
        return { ok: false, message: 'Workspace is already connected.' };
      }

      track('workspace-connect-started');

      const previousPrefixes = new Set(allMounts.map((mount) => mount.prefix));

      // Connect-new is picker-first because there is no workspace path until
      // the native picker resolves. Carry the selected config into the
      // below-input selector once the picked workspace mounts.
      if (path === undefined) {
        if (!config)
          return { ok: false, message: 'No workspace action selected.' };
        const pendingId = ++pendingConnectActionIdRef.current;
        pendingConnectActionConfigsRef.current.push({
          id: pendingId,
          path,
          config,
          previousPrefixes,
        });
        const mountPromise = mountWorkspace(openAgent);
        void trackMountOutcome(mountPromise, 'picker').then((didMount) => {
          if (didMount) return;
          pendingConnectActionConfigsRef.current =
            pendingConnectActionConfigsRef.current.filter(
              (pending) => pending.id !== pendingId,
            );
        });
        onWorkspaceChange?.();
        return { ok: true };
      }

      // In the empty-chat state, recent-workspace actions are preparation for
      // the first message. Plain non-Git workspaces still mount for context,
      // but do not carry a pending Git action into the below-input selector.
      if (chatIsEmpty) {
        const mountPromise = mountWorkspace(openAgent, path);
        const pendingId = ++pendingConnectActionIdRef.current;
        if (config) {
          pendingConnectActionConfigsRef.current.push({
            id: pendingId,
            path,
            config,
            previousPrefixes,
          });
        }
        void trackMountOutcome(mountPromise, 'recent-workspace').then(
          (didMount) => {
            if (didMount || !config) return;
            pendingConnectActionConfigsRef.current =
              pendingConnectActionConfigsRef.current.filter(
                (pending) => pending.id !== pendingId,
              );
          },
        );
        onWorkspaceChange?.();
        return { ok: true };
      }

      if (!config) {
        try {
          await mountWorkspace(openAgent, path);
          track('workspace-connect-finished');
          onWorkspaceChange?.();
          return { ok: true };
        } catch (error) {
          track('workspace-connect-failed', { source: 'recent-workspace' });
          return {
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to connect workspace.',
          };
        }
      }

      // After messages exist, there is no first-send preparation phase, so
      // recent-workspace actions execute immediately against the trusted path.
      try {
        const result = await executeWorkspaceGitActionByPath({
          agentInstanceId: openAgent,
          workspacePath: path,
          config,
          executor: {
            createGitWorktreeByPath,
            createGitBranchByPath,
            switchGitBranchByPath,
            mountWorkspace,
          },
        });

        if (!result.ok) {
          track('workspace-connect-failed', { source: 'recent-workspace' });
          return { ok: false, message: result.message };
        }

        track('workspace-connect-finished');
        onWorkspaceChange?.();
        return { ok: true };
      } catch (error) {
        track('workspace-connect-failed', { source: 'recent-workspace' });
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to connect workspace.',
        };
      }
    },
    [
      allMounts,
      chatIsEmpty,
      createGitBranchByPath,
      createGitWorktreeByPath,
      mountedPaths,
      mountWorkspace,
      onWorkspaceChange,
      openAgent,
      switchGitBranchByPath,
      track,
      trackMountOutcome,
    ],
  );

  useEffect(() => {
    if (!chatIsEmpty || !onWorkspaceActionConfigChange) return;
    if (pendingConnectActionConfigsRef.current.length === 0) return;

    for (const mount of allMounts) {
      const pendingIndex = pendingConnectActionConfigsRef.current.findIndex(
        (pending) =>
          // Empty-chat recent workspace connects are matched by absolute path;
          // picker-created workspaces are matched by the newly added prefix.
          pending.path === mount.path ||
          (pending.path === undefined &&
            !pending.previousPrefixes.has(mount.prefix)),
      );
      if (pendingIndex === -1) continue;

      const pending = pendingConnectActionConfigsRef.current[pendingIndex];
      if (!pending) continue;
      pendingConnectActionConfigsRef.current.splice(pendingIndex, 1);
      if (mount.git) {
        onWorkspaceActionConfigChange(mount, pending.config);
      }
    }
  }, [
    allMounts,
    chatIsEmpty,
    onWorkspaceActionConfigChange,
    workspaceActionConfigs,
  ]);

  const handleUnmount = useCallback(
    (prefix: string) => {
      if (openAgent) {
        void unmountWorkspace(openAgent, prefix);
        onWorkspaceChange?.();
      }
    },
    [openAgent, unmountWorkspace, onWorkspaceChange],
  );

  if (!openAgent) return null;

  return (
    <div className="scrollbar-none flex min-w-0 shrink-0 items-center gap-7 overflow-x-auto px-1 py-0.5">
      {/* Connected workspaces */}
      {allMounts.map((mount) => {
        const useActionSelect = chatIsEmpty && !!mount.git;
        return useActionSelect ? (
          <WorkspaceActionSelect
            key={mount.prefix}
            mount={mount}
            onUnmount={handleUnmount}
            config={workspaceActionConfigs?.get(mount.prefix)}
            onConfigChange={onWorkspaceActionConfigChange}
            agentInstanceId={openAgent}
          />
        ) : (
          <WorkspaceBadge
            key={mount.prefix}
            mount={mount}
            onUnmount={handleUnmount}
            agentInstanceId={openAgent}
          />
        );
      })}

      <ConnectWorkspaceSelect
        hasMounts={hasMounts}
        recentPaths={recentPaths}
        onMount={handleMount}
      />
    </div>
  );
});
