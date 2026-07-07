import { Switch } from '@stagewise/stage-ui/components/switch';
import { IconPenDrawSparkleFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from 'react';
import { cn } from '@ui/utils';
import type { ContextFilesResult } from '@shared/karton-contracts/pages-api/types';
import type { MountEntry, AppState } from '@shared/karton-contracts/ui';
import type { Patch } from '@shared/karton-contracts/ui/shared-types';
import { Button } from '@stagewise/stage-ui/components/button';
import { Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { getWorkspaceDisplayInfo } from '@ui/utils/workspace-display';
import { createRafResizeObserver } from '@ui/utils/resize-observer';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import type { RefObject } from 'react';
import { SettingsScrollTabs } from '../_components/settings-scroll-tabs';
import { ALWAYS_ENABLED_GLOBAL_SKILL_PREFIXES } from '@shared/global-skill-prefixes';

// =============================================================================
// Vertical overflow detection (like useIsTruncated but for height)
// =============================================================================

function useIsOverflowing(ref: RefObject<HTMLElement | null>) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      setIsOverflowing(el.isConnected && el.scrollHeight > el.clientHeight);
    };
    check();

    const { observer, disconnect } = createRafResizeObserver(check);
    observer.observe(el);
    return () => disconnect();
  });

  return { isOverflowing, tooltipOpen, setTooltipOpen };
}

// =============================================================================
// Workspace Subheader
// =============================================================================

// =============================================================================
// Skills Section
// =============================================================================

function WorkspaceSkillsList({
  workspacePath,
  skills,
}: {
  workspacePath: string;
  skills: Array<{ name: string; description: string }>;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);

  const disabledSkills = useMemo(
    () =>
      preferences?.agent?.workspaceSettings?.[workspacePath]?.disabledSkills ??
      [],
    [preferences, workspacePath],
  );

  const sortedSkills = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills],
  );

  const handleToggleSkill = useCallback(
    async (skillName: string, enabled: boolean) => {
      const currentSettings =
        preferences?.agent?.workspaceSettings?.[workspacePath];
      const current = currentSettings?.disabledSkills ?? [];
      const next = enabled
        ? current.filter((s) => s !== skillName)
        : [...current, skillName];

      const patches: Patch[] = currentSettings
        ? [
            {
              op: 'replace' as const,
              path: [
                'agent',
                'workspaceSettings',
                workspacePath,
                'disabledSkills',
              ],
              value: next,
            },
          ]
        : [
            {
              op: 'add' as const,
              path: ['agent', 'workspaceSettings', workspacePath],
              value: { respectAgentsMd: true, disabledSkills: next },
            },
          ];

      await updatePreferences(patches);
    },
    [workspacePath, preferences, updatePreferences],
  );

  if (sortedSkills.length === 0) return null;

  return (
    <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-derived">
      {sortedSkills.map((skill) => {
        const isEnabled = !disabledSkills.includes(skill.name);
        return (
          <SkillRow
            key={skill.name}
            skill={skill}
            isEnabled={isEnabled}
            onToggle={() => handleToggleSkill(skill.name, !isEnabled)}
          />
        );
      })}
    </div>
  );
}

function SkillRow({
  skill,
  isEnabled,
  onToggle,
}: {
  skill: { name: string; description: string };
  isEnabled: boolean;
  onToggle: () => void;
}) {
  const descRef = useRef<HTMLParagraphElement>(null);
  const { isOverflowing, tooltipOpen, setTooltipOpen } =
    useIsOverflowing(descRef);

  return (
    <Tooltip open={isOverflowing && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger delay={400}>
        <div
          className="flex cursor-pointer items-start gap-4 p-3"
          onClick={onToggle}
        >
          <div className="-mt-1 min-w-0 flex-1">
            <p
              className={cn(
                'font-medium text-sm',
                isEnabled ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {skill.name}
            </p>
            <p
              ref={descRef}
              className={cn(
                'max-h-11.5 overflow-hidden text-xs',
                isEnabled ? 'text-muted-foreground' : 'text-subtle-foreground',
                isOverflowing && 'mask-alpha',
              )}
              style={
                isOverflowing
                  ? {
                      maskImage:
                        'linear-gradient(to bottom, black 0%, transparent 100%)',
                      WebkitMaskImage:
                        'linear-gradient(to bottom, black 0%, transparent 100%)',
                    }
                  : undefined
              }
            >
              {skill.description}
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={isEnabled}
              onCheckedChange={() => onToggle()}
              size="xs"
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <p className="max-w-xs text-xs leading-relaxed">{skill.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function WorkspaceDetails({
  mount,
  contextFiles,
}: {
  mount: MountEntry;
  contextFiles: ContextFilesResult | null;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-medium text-foreground text-lg">Skills</h2>
          <p className="text-muted-foreground text-sm">
            Enable or disable skills for this workspace.
          </p>
        </div>
        {mount.skills.length > 0 ? (
          <WorkspaceSkillsList
            workspacePath={mount.path}
            skills={mount.skills}
          />
        ) : (
          <div className="rounded-lg border border-derived-subtle p-4">
            <p className="text-center text-muted-foreground text-sm">
              No skills detected in this workspace.
            </p>
          </div>
        )}
      </section>
      <hr className="border-derived-subtle border-t" />
      <section className="space-y-3">
        <div>
          <h2 className="font-medium text-foreground text-lg">Context files</h2>
          <p className="text-muted-foreground text-sm">
            Manage workspace context files used by the AI agent.
          </p>
        </div>
        <WorkspaceContextFilesList
          workspacePath={mount.path}
          workspaceMd={
            contextFiles?.[mount.path]?.workspaceMd ?? {
              exists: mount.workspaceMdContent !== null,
              path: null,
              content: null,
            }
          }
        />
      </section>
    </div>
  );
}

// =============================================================================
// Global Skills Section
// =============================================================================

/** Mount prefixes that are always enabled (not toggleable in the UI). */
/** Display metadata for each global skill directory. */
const GLOBAL_SKILL_DIR_META: Record<string, { label: string; dir: string }> = {
  'globalskills-sw': { label: 'Stagewise', dir: '~/.stagewise/skills' },
  'globalskills-agents': { label: 'Agents', dir: '~/.agents/skills' },
  'globalskills-codex': { label: 'Codex', dir: '~/.codex/skills' },
  'globalskills-claude': { label: 'Claude Code', dir: '~/.claude/skills' },
};

/** Stable ordering for global skill directory display. */
const GLOBAL_SKILL_DIR_ORDER = [
  'globalskills-sw',
  'globalskills-agents',
  'globalskills-codex',
  'globalskills-claude',
] as const;

/**
 * Lookup metadata for a global skill dir prefix. Throws if the prefix
 * is not in `GLOBAL_SKILL_DIR_META` — all callers use
 * `GLOBAL_SKILL_DIR_ORDER` so the key is always valid.
 */
function getGlobalSkillDirMeta(prefix: string): {
  label: string;
  dir: string;
} {
  const meta = GLOBAL_SKILL_DIR_META[prefix];
  if (!meta) throw new Error(`Unknown global skill dir prefix: ${prefix}`);
  return meta;
}

type GlobalSkillEntry = AppState['globalSkills'][number];

function GlobalSkillsDetails() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const globalSkills = useKartonState((s) => s.globalSkills);

  const enabledGlobalSkillDirs = useMemo(
    () => preferences?.agent?.enabledGlobalSkillDirs ?? [],
    [preferences],
  );
  const disabledGlobalSkills = useMemo(
    () => preferences?.agent?.disabledGlobalSkills ?? [],
    [preferences],
  );

  // Group skills by mount prefix for per-dir rendering.
  const skillsByPrefix = useMemo(() => {
    const map = new Map<string, GlobalSkillEntry[]>();
    for (const skill of globalSkills) {
      const arr = map.get(skill.mountPrefix) ?? [];
      arr.push(skill);
      map.set(skill.mountPrefix, arr);
    }
    // Sort skills within each group by name.
    for (const arr of Array.from(map.values())) {
      arr.sort((a: GlobalSkillEntry, b: GlobalSkillEntry) =>
        a.name.localeCompare(b.name),
      );
    }
    return map;
  }, [globalSkills]);

  const handleToggleDir = useCallback(
    async (prefix: string, enabled: boolean) => {
      const current = enabledGlobalSkillDirs;
      const next = enabled
        ? current.includes(prefix)
          ? current
          : [...current, prefix]
        : current.filter((p) => p !== prefix);
      await updatePreferences([
        {
          op: 'replace' as const,
          path: ['agent', 'enabledGlobalSkillDirs'],
          value: next,
        },
      ]);
    },
    [enabledGlobalSkillDirs, updatePreferences],
  );

  const handleToggleSkill = useCallback(
    async (skillName: string, enabled: boolean) => {
      const current = disabledGlobalSkills;
      const next = enabled
        ? current.filter((s) => s !== skillName)
        : [...current, skillName];
      await updatePreferences([
        {
          op: 'replace' as const,
          path: ['agent', 'disabledGlobalSkills'],
          value: next,
        },
      ]);
    },
    [disabledGlobalSkills, updatePreferences],
  );

  return (
    <div className="space-y-8">
      {GLOBAL_SKILL_DIR_ORDER.map((prefix) => {
        const meta = getGlobalSkillDirMeta(prefix);
        const isAlwaysEnabled =
          ALWAYS_ENABLED_GLOBAL_SKILL_PREFIXES.has(prefix);
        const dirEnabled =
          isAlwaysEnabled || enabledGlobalSkillDirs.includes(prefix);
        const skills = skillsByPrefix.get(prefix) ?? [];

        return (
          <div key={prefix}>
            {prefix !== GLOBAL_SKILL_DIR_ORDER[0] && (
              <hr className="border-derived-subtle border-t" />
            )}
            <section className="space-y-3 pt-8 first:pt-0">
              {/* Header with inline dir toggle next to name */}
              <div
                className={isAlwaysEnabled ? undefined : 'cursor-pointer'}
                role={isAlwaysEnabled ? undefined : 'button'}
                tabIndex={isAlwaysEnabled ? undefined : 0}
                onClick={() => {
                  if (!isAlwaysEnabled)
                    void handleToggleDir(prefix, !dirEnabled);
                }}
                onKeyDown={(e) => {
                  if (
                    !isAlwaysEnabled &&
                    (e.key === 'Enter' || e.key === ' ')
                  ) {
                    e.preventDefault();
                    void handleToggleDir(prefix, !dirEnabled);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-foreground text-lg">
                    {meta.label} skills
                  </h3>
                  {!isAlwaysEnabled && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={dirEnabled}
                        onCheckedChange={() =>
                          void handleToggleDir(prefix, !dirEnabled)
                        }
                        size="xs"
                      />
                    </div>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {meta.dir}
                  {skills.length > 0 &&
                    ` · ${skills.length} skill${skills.length === 1 ? '' : 's'}`}
                </p>
              </div>
              {/* Per-skill toggles (only when dir is enabled) */}
              {dirEnabled && skills.length > 0 && (
                <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-derived">
                  {skills.map((skill) => {
                    const isSkillEnabled = !disabledGlobalSkills.includes(
                      skill.name,
                    );
                    return (
                      <SkillRow
                        key={`${prefix}:${skill.name}`}
                        skill={skill}
                        isEnabled={isSkillEnabled}
                        onToggle={() =>
                          handleToggleSkill(skill.name, !isSkillEnabled)
                        }
                      />
                    );
                  })}
                </div>
              )}
              {/* Empty state when dir is enabled but no skills found */}
              {dirEnabled && skills.length === 0 && (
                <p className="text-sm text-subtle-foreground italic">
                  No skills found in this directory.
                </p>
              )}
            </section>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Context Files Section
// =============================================================================

function WorkspaceContextFilesList({
  workspacePath,
  workspaceMd,
}: {
  workspacePath: string;
  workspaceMd: { exists: boolean; path: string | null; content: string | null };
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const generateWorkspaceMd = useKartonProcedure(
    (p) => p.toolbox.generateWorkspaceMdForPath,
  );
  const isGenerating = useKartonState(
    (s) => !!s.workspaceMdGenerating[workspacePath],
  );

  const respectAgentsMd =
    preferences?.agent?.workspaceSettings?.[workspacePath]?.respectAgentsMd ??
    true;

  const handleGenerate = useCallback(async () => {
    await generateWorkspaceMd(workspacePath);
  }, [generateWorkspaceMd, workspacePath]);

  const handleToggleAgentsMd = useCallback(
    async (checked: boolean) => {
      const currentSettings =
        preferences?.agent?.workspaceSettings?.[workspacePath];

      const patches: Patch[] = currentSettings
        ? [
            {
              op: 'replace' as const,
              path: [
                'agent',
                'workspaceSettings',
                workspacePath,
                'respectAgentsMd',
              ],
              value: checked,
            },
          ]
        : [
            {
              op: 'add' as const,
              path: ['agent', 'workspaceSettings', workspacePath],
              value: { respectAgentsMd: checked },
            },
          ];

      await updatePreferences(patches);
    },
    [workspacePath, preferences, updatePreferences],
  );

  return (
    <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-derived">
      {/* WORKSPACE.md row */}
      <div className="flex items-start gap-4 p-3">
        <div className="-mt-1 min-w-0 flex-1">
          <p className="font-medium text-foreground text-sm">WORKSPACE.md</p>
          <p className="text-muted-foreground text-xs">
            {workspaceMd.exists
              ? 'Auto-generated project analysis.'
              : 'Not yet generated.'}
          </p>
        </div>
        {workspaceMd.exists ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3" />
            )}
            {isGenerating ? 'Updating…' : 'Regenerate'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="xs"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <IconPenDrawSparkleFillDuo18 className="size-3" />
            )}
            {isGenerating ? 'Generating…' : 'Generate'}
          </Button>
        )}
      </div>

      {/* AGENTS.md row */}
      <div
        className="flex cursor-pointer items-start gap-4 p-3"
        onClick={() => handleToggleAgentsMd(!respectAgentsMd)}
      >
        <div className="-mt-1 min-w-0 flex-1">
          <p
            className={cn(
              'font-medium text-sm',
              respectAgentsMd ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            AGENTS.md
          </p>
          <p
            className={cn(
              'text-xs',
              respectAgentsMd
                ? 'text-muted-foreground'
                : 'text-subtle-foreground',
            )}
          >
            Include in agent context
          </p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={respectAgentsMd}
            onCheckedChange={handleToggleAgentsMd}
            size="xs"
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export function SkillsContextSection() {
  const workspaceMounts = useKartonState(
    useComparingSelector(
      (s): MountEntry[] => {
        const seen = new Map<string, MountEntry>();

        for (const agentId in s.toolbox) {
          const mounts = s.toolbox[agentId]?.workspace?.mounts ?? [];
          for (const mount of mounts) {
            if (!seen.has(mount.path)) seen.set(mount.path, mount);
          }
        }

        return Array.from(seen.values());
      },
      (a, b) => {
        if (a === b) return true;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return false;
        }
        return true;
      },
    ),
  );
  const getContextFiles = useKartonProcedure((p) => p.toolbox.getContextFiles);
  const getContextFilesRef = useRef(getContextFiles);
  getContextFilesRef.current = getContextFiles;

  const [contextFiles, setContextFiles] = useState<ContextFilesResult | null>(
    null,
  );

  const workspaceMdGenerating = useKartonState((s) => s.workspaceMdGenerating);
  const prevGeneratingRef = useRef<Record<string, boolean>>({});

  const mountPathsKey = useMemo(
    () => workspaceMounts.map((m) => m.path).join('\0'),
    [workspaceMounts],
  );

  useEffect(() => {
    void getContextFilesRef.current().then((files) => {
      setContextFiles(files);
    });
  }, [mountPathsKey]);

  useEffect(() => {
    const prev = prevGeneratingRef.current;
    const justFinished = Object.keys(prev).some(
      (path) => prev[path] && !workspaceMdGenerating[path],
    );
    prevGeneratingRef.current = { ...workspaceMdGenerating };

    if (justFinished) {
      void getContextFilesRef.current().then((files) => {
        setContextFiles(files);
      });
    }
  }, [workspaceMdGenerating]);

  const GLOBAL_TAB_ID = '__global__';

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  // Build the tab list: "Global" first, then workspace tabs.
  const tabItems = useMemo(
    () => [
      { id: GLOBAL_TAB_ID, label: 'Global' },
      ...workspaceMounts.map((mount) => {
        const display = getWorkspaceDisplayInfo({
          path: mount.path,
          git: mount.git,
        });
        return {
          id: mount.path,
          label: display.title,
          subLabel: mount.path,
        };
      }),
    ],
    [workspaceMounts],
  );

  const selectedMount = useMemo(
    () =>
      workspaceMounts.find((m) => m.path === selectedTabId) ??
      workspaceMounts[0] ??
      null,
    [workspaceMounts, selectedTabId],
  );

  // Compute the effective tab ID: when the user hasn't clicked
  // anything yet (or the previously selected tab no longer exists),
  // fall back to the first tab ("Global").
  const effectiveTabId =
    selectedTabId != null && tabItems.some((t) => t.id === selectedTabId)
      ? selectedTabId
      : (tabItems[0]?.id ?? null);
  const isGlobalTab = effectiveTabId === GLOBAL_TAB_ID;

  return (
    <div className="h-full w-full">
      {/* Content */}
      <OverlayScrollbar className="h-full" contentClassName="px-6 pt-24 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Header */}
          <div>
            <h1 className="font-semibold text-foreground text-xl">
              Skills & Context files
            </h1>
            <p className="text-muted-foreground text-sm">
              Per-workspace configuration, context files, and skills for the
              stagewise agent.
            </p>
          </div>
          <div className="space-y-8">
            <SettingsScrollTabs
              selectedId={effectiveTabId}
              onSelect={setSelectedTabId}
              truncateSubLabelFromStart
              items={tabItems}
            />
            {isGlobalTab ? (
              <GlobalSkillsDetails />
            ) : selectedMount ? (
              <WorkspaceDetails
                mount={selectedMount}
                contextFiles={contextFiles}
              />
            ) : null}
          </div>
        </div>
      </OverlayScrollbar>
    </div>
  );
}
