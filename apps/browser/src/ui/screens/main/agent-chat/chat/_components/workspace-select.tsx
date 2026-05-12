import { Select, type SelectItem } from '@stagewise/stage-ui/components/select';
import { IconPlusFill18, IconXmarkFill18 } from 'nucleo-ui-fill-18';
import {
  IconFolder5Outline18,
  IconPenDrawSparkleOutline18,
  IconCodeBranchOutline18,
} from 'nucleo-ui-outline-18';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { PreviewCard as PreviewCardBase } from '@base-ui/react/preview-card';
import {
  PreviewCard,
  PreviewCardTrigger,
} from '@stagewise/stage-ui/components/preview-card';
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
import { type MountEntry, EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
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
import TimeAgo from 'react-timeago';
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';
import { Button } from '@stagewise/stage-ui/components/button';

const EMPTY_SKILLS: string[] = [];

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

  const cancelPendingClear = useCallback(() => {
    if (clearTimerRef.current !== undefined) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = undefined;
    }
  }, []);

  const scheduleClear = useCallback(() => {
    cancelPendingClear();
    clearTimerRef.current = setTimeout(() => {
      setSidePanelContent(null);
      clearTimerRef.current = undefined;
    }, 150);
  }, [cancelPendingClear]);

  useEffect(() => cancelPendingClear, [cancelPendingClear]);

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
      const target = event.currentTarget;
      const container = containerRef.current;
      if (!container) {
        setSidePanelContent(content);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const itemRect = target.getBoundingClientRect();
      const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

      setItemCenterY(centerY);
      setSidePanelContent(content);
    },
    [cancelPendingClear],
  );

  return (
    <PreviewCard>
      <FileContextMenu relativePath={mount.path} resolvePath={resolveAbsolute}>
        <div
          className={cn(
            'group/badge inline-flex items-center gap-1',
            'rounded-md border border-derived px-1.5 py-0.5 text-muted-foreground',
            'text-xs transition-colors duration-100',
            'hover:bg-hover-derived hover:text-foreground',
            'hover:has-[[data-unmount]:hover]:text-muted-foreground',
            'has-[[data-popup-open]]:bg-hover-derived has-[[data-popup-open]]:text-foreground',
          )}
        >
          <PreviewCardTrigger delay={200} closeDelay={300}>
            <span className="inline-flex items-center gap-1">
              {mount.isGitRepo ? (
                <IconCodeBranchOutline18 className="size-3 shrink-0" />
              ) : (
                <IconFolder5Outline18 className="size-3 shrink-0" />
              )}
              <span className="max-w-32 truncate">{name}</span>
            </span>
          </PreviewCardTrigger>
          <Tooltip>
            <TooltipTrigger>
              <span
                role="button"
                tabIndex={-1}
                data-unmount
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onUnmount(mount.prefix);
                }}
                className={cn(
                  'flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded',
                  'text-subtle-foreground transition-colors duration-100',
                  'hover:text-foreground',
                )}
              >
                <IconXmarkFill18 className="size-2.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Disconnect {name}</TooltipContent>
          </Tooltip>
        </div>
      </FileContextMenu>

      <PreviewCardBase.Portal>
        <PreviewCardBase.Backdrop
          className="pointer-events-auto absolute inset-0 z-40 size-full"
          onClick={(e) => e.stopPropagation()}
        />
        <PreviewCardBase.Positioner
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
            <PreviewCardBase.Popup
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex max-w-72 flex-col gap-0 p-0',
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
                respectAgentsMd={respectAgentsMd}
                onToggleAgentsMd={handleToggleAgentsMd}
                onItemHover={handleItemHover}
                isGeneratingWorkspaceMd={isGeneratingWorkspaceMd}
                onGenerateWorkspaceMd={handleGenerateWorkspaceMd}
                disabledSkills={disabledSkills}
                onToggleSkill={handleToggleSkill}
              />
            </PreviewCardBase.Popup>

            {sidePanelContent && (
              <div
                ref={sidePanelRef}
                onMouseEnter={cancelPendingClear}
                className={cn(
                  'absolute left-full ml-1 flex w-72 flex-col rounded-lg border border-derived bg-background text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
                  'fade-in-0 slide-in-from-left-1 animate-in duration-150',
                  sidePanelContent.type === 'skill' ? 'gap-1 p-2.5' : 'p-0',
                )}
                style={{ top: sidePanelOffset }}
              >
                {sidePanelContent.type === 'skill' ? (
                  <div
                    className={cn(
                      'flex flex-col gap-1',
                      disabledSkills.includes(sidePanelContent.name) &&
                        'opacity-60',
                    )}
                  >
                    <div className="font-semibold">{sidePanelContent.name}</div>
                    <div className="text-muted-foreground">
                      {sidePanelContent.description}
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            )}
          </div>
        </PreviewCardBase.Positioner>
      </PreviewCardBase.Portal>
    </PreviewCard>
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
            className="absolute right-0 bottom-0 flex h-6 items-center gap-1 rounded-tl-lg border-derived border-t border-l bg-background px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground dark:bg-surface-1"
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
  | { type: 'skill'; name: string; description: string }
  | { type: 'workspaceMd'; content: string; workspacePath: string }
  | { type: 'agentsMd'; content: string; workspacePath: string };

function WorkspacePreviewCardContent({
  mount,
  name,
  respectAgentsMd,
  onToggleAgentsMd,
  onItemHover,
  isGeneratingWorkspaceMd,
  onGenerateWorkspaceMd,
  disabledSkills,
  onToggleSkill,
}: {
  mount: MountEntry;
  name: string;
  respectAgentsMd: boolean;
  onToggleAgentsMd: (checked: boolean) => void;
  onItemHover: (
    content: SidePanelContent,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  isGeneratingWorkspaceMd: boolean;
  onGenerateWorkspaceMd: () => void;
  disabledSkills: string[];
  onToggleSkill: (skillName: string, enabled: boolean) => void;
}) {
  const hasSkills = mount.skills.length > 0;
  const agentsMdDisabled = mount.agentsMdContent === null;

  const [skillsViewport, setSkillsViewport] = useState<HTMLElement | null>(
    null,
  );
  const skillsViewportRef = useMemo(
    () => ({ current: skillsViewport }),
    [skillsViewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle: skillsMaskStyle } = useScrollFadeMask(skillsViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  return (
    <div className="flex flex-col">
      {/* Header: folder name + git badge + path */}
      <div className="flex flex-col items-start gap-0.5 px-2.5 pt-1.5 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-foreground text-xs">
            {name}
          </span>
          {mount.isGitRepo && (
            <>
              <IconCodeBranchOutline18 className="size-3 shrink-0 text-muted-foreground" />
              {mount.gitBranch && (
                <span className="max-w-24 truncate text-2xs text-subtle-foreground leading-normal">
                  {mount.gitBranch}
                </span>
              )}
            </>
          )}
        </div>
        <span
          className="max-w-full truncate text-2xs text-subtle-foreground leading-normal"
          dir="rtl"
        >
          <span dir="ltr">{mount.path}</span>
        </span>
      </div>

      {/* Context files section */}
      <div className="flex flex-col gap-1 border-derived-subtle border-t px-2.5 py-2">
        {/* WORKSPACE.md status */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground text-xs">
            Context files
          </span>
        </div>
        <div
          className="flex items-center gap-1.5"
          onMouseEnter={
            mount.workspaceMdContent
              ? (e) =>
                  onItemHover(
                    {
                      type: 'workspaceMd',
                      content: mount.workspaceMdContent!,
                      workspacePath: mount.path,
                    },
                    e,
                  )
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
                className="flex items-center gap-1.5"
                onMouseEnter={
                  mount.agentsMdContent
                    ? (e) =>
                        onItemHover(
                          {
                            type: 'agentsMd',
                            content: mount.agentsMdContent!,
                            workspacePath: mount.path,
                          },
                          e,
                        )
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
      </div>

      {/* Skills section */}
      {hasSkills && (
        <div className="flex flex-col gap-1 border-derived-subtle border-t px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground text-xs">Skills</span>
          </div>
          <OverlayScrollbar
            className="mask-alpha max-h-32"
            style={skillsMaskStyle}
            options={{ overflow: { x: 'hidden', y: 'scroll' } }}
            onViewportRef={setSkillsViewport}
          >
            <div className="flex flex-col gap-0.75">
              {[...mount.skills]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((skill) => {
                  const isEnabled = !disabledSkills.includes(skill.name);
                  const toggleId = `skill-toggle-${skill.name}`;
                  return (
                    <div
                      key={skill.name}
                      className="flex items-center gap-1.5"
                      onMouseEnter={(e) =>
                        onItemHover(
                          {
                            type: 'skill',
                            name: skill.name,
                            description: skill.description,
                          },
                          e,
                        )
                      }
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
        </div>
      )}
    </div>
  );
}

interface WorkspaceSelectProps {
  onWorkspaceChange?: () => void;
}

export const WorkspaceSelect = memo(function WorkspaceSelect({
  onWorkspaceChange,
}: WorkspaceSelectProps) {
  const [openAgent] = useOpenAgent();

  const recentlyOpenedWorkspaces = useKartonState(
    (s) => s.userExperience.storedExperienceData.recentlyOpenedWorkspaces,
  );
  const mountWorkspace = useKartonProcedure((p) => p.toolbox.mountWorkspace);
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

  // Live ref of the mount count. We assign it during render so callbacks can
  // read the latest count after mountWorkspace() resolves without stale state.
  const allMountsCountRef = useRef(allMounts.length);
  allMountsCountRef.current = allMounts.length;

  const trackMountOutcome = useCallback(
    async (promise: Promise<void>, source: 'picker' | 'recent-workspace') => {
      const before = allMountsCountRef.current;
      try {
        await promise;
      } catch {
        track('workspace-connect-failed', { source });
        return;
      }
      // A mount is considered successful if the count grew. If it stayed the
      // same and the user went through the picker, they closed it without
      // selecting. The recent-workspace path cannot be aborted the same way,
      // so we only track an abort for the picker case.
      if (allMountsCountRef.current > before) {
        track('workspace-connect-finished');
      } else if (source === 'picker') {
        track('workspace-connect-aborted', { reason: 'picker-closed' });
      }
    },
    [track],
  );

  const hasMounts = allMounts.length > 0;

  const minimalFormatter = useMemo(
    () =>
      buildFormatter({
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
      }),
    [],
  );

  const menuItems = useMemo((): SelectItem[] => {
    const items: SelectItem[] = [];

    const sortedWorkspaces = [...recentlyOpenedWorkspaces]
      .filter((w) => !mountedPaths.has(w.path))
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, 3);

    for (const workspace of sortedWorkspaces) {
      items.push({
        value: `workspace:${workspace.path}`,
        label: (
          <span className="flex w-full items-baseline gap-2">
            <span className="truncate">{workspace.name}</span>
            <span className="shrink-0 text-subtle-foreground text-xs">
              <TimeAgo
                date={workspace.openedAt}
                formatter={minimalFormatter}
                live={false}
              />
            </span>
          </span>
        ),
        description: (
          <span className="truncate text-subtle-foreground" dir="rtl">
            <span dir="ltr">{workspace.path}</span>
          </span>
        ),
        group: 'Recent workspaces',
      });
    }

    items.push({
      value: 'open-folder',
      label: (
        <span className="flex items-center gap-1.5 text-muted-foreground group-hover/item:text-foreground">
          <IconPlusFill18 className="size-3.5" />
          <span>Connect new workspace</span>
        </span>
      ),
      group: 'Recent workspaces',
    });

    return items;
  }, [mountedPaths, recentlyOpenedWorkspaces, minimalFormatter]);

  const hasRecentItems = menuItems.length > 1;

  const handleMenuSelect = useCallback(
    (value: string | null) => {
      if (!value || !openAgent) return;

      if (value.startsWith('workspace:')) {
        const path = value.replace('workspace:', '');
        if (mountedPaths.has(path)) return;

        track('workspace-connect-started');
        void trackMountOutcome(
          mountWorkspace(openAgent, path),
          'recent-workspace',
        );
        onWorkspaceChange?.();
      } else if (value === 'open-folder') {
        track('workspace-connect-started');
        void trackMountOutcome(mountWorkspace(openAgent, undefined), 'picker');
        onWorkspaceChange?.();
      }
    },
    [
      mountedPaths,
      openAgent,
      mountWorkspace,
      onWorkspaceChange,
      track,
      trackMountOutcome,
    ],
  );

  const openFilePicker = useCallback(() => {
    if (!openAgent) return;
    track('workspace-connect-started');
    void trackMountOutcome(mountWorkspace(openAgent, undefined), 'picker');
    onWorkspaceChange?.();
  }, [openAgent, mountWorkspace, onWorkspaceChange, track, trackMountOutcome]);

  const renderItem = useCallback((item: SelectItem) => {
    const isRecent = String(item.value).startsWith('workspace:');
    const hasDescription = !!item.description;

    if (isRecent) {
      const path = String(item.value).replace('workspace:', '');
      const name = getBaseName(path) || path;
      return (
        <Tooltip>
          <TooltipTrigger>
            <div className="flex w-full cursor-pointer flex-col">
              <div
                className={cn(
                  'flex flex-col transition-[mask-image] duration-200',
                  'group-hover/item:mask-[linear-gradient(to_left,transparent_0px,transparent_24px,black_48px)]',
                )}
              >
                <div className="flex min-w-0 flex-row items-center gap-2 text-xs">
                  <span className="truncate">{item.label}</span>
                </div>
                {hasDescription && (
                  <span className="truncate text-subtle-foreground text-xs leading-normal">
                    {item.description}
                  </span>
                )}
              </div>
              <span className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/item:opacity-100">
                <IconPlusFill18 className="size-3 text-muted-foreground group-hover/item:text-foreground" />
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Connect {name}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div className="flex w-full cursor-pointer flex-col">
        <div className="flex min-w-0 flex-row items-center gap-2 text-xs">
          <span className="truncate">{item.label}</span>
        </div>
        {hasDescription && (
          <span className="truncate text-subtle-foreground text-xs leading-normal">
            {item.description}
          </span>
        )}
      </div>
    );
  }, []);

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
    <>
      {/* Connected workspace badges */}
      {allMounts.map((mount) => (
        <WorkspaceBadge
          key={mount.prefix}
          mount={mount}
          onUnmount={handleUnmount}
          agentInstanceId={openAgent}
        />
      ))}

      {/* Connect button — opens recents popover or file picker directly */}
      {hasRecentItems ? (
        <Select
          items={menuItems}
          value={null}
          onValueChange={handleMenuSelect}
          side="top"
          sideOffset={8}
          popupClassName="max-w-64"
          scrollContainerClassName="max-h-96"
          size="xs"
          showItemIndicator={false}
          itemClassName="relative [&>*]:w-full"
          renderItem={renderItem}
          customTrigger={(triggerProps) =>
            hasMounts ? (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="secondary"
                    size="xs"
                    {...triggerProps}
                    className="h-5.5 bg-background text-muted-foreground hover:text-foreground dark:bg-surface-1"
                  >
                    <IconFolder5Outline18 className="size-3" />
                    <IconPlusFill18 className="size-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Give the agent access to your files.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="secondary"
                    size="xs"
                    {...triggerProps}
                    className="h-5.5 bg-background text-muted-foreground hover:text-foreground dark:bg-surface-1"
                  >
                    <IconFolder5Outline18 className="size-3" />
                    <span>Connect workspace</span>
                    <IconPlusFill18 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Give the agent access to your files.
                </TooltipContent>
              </Tooltip>
            )
          }
        />
      ) : hasMounts ? (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="secondary"
              size="xs"
              onClick={openFilePicker}
              className="h-5.5 bg-background text-muted-foreground hover:text-foreground dark:bg-surface-1"
            >
              <IconFolder5Outline18 className="size-3" />
              <IconPlusFill18 className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Give the agent access to your files.</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="secondary"
              size="xs"
              onClick={openFilePicker}
              className="h-5.5 bg-background text-muted-foreground hover:text-foreground dark:bg-surface-1"
            >
              <IconFolder5Outline18 className="size-3" />
              <span>Connect workspace</span>
              <IconPlusFill18 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Give the agent access to your files.</TooltipContent>
        </Tooltip>
      )}
    </>
  );
});
