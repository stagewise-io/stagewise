import { createFileRoute } from '@tanstack/react-router';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { IconPenDrawSparkleFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from 'react';
import { cn } from '@pages/utils';
import type { ContextFilesResult } from '@shared/karton-contracts/pages-api/types';
import type { Patch } from '@shared/karton-contracts/ui/shared-types';
import { Button } from '@stagewise/stage-ui/components/button';
import { Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { getBaseName } from '@shared/path-utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import type { RefObject } from 'react';

export const Route = createFileRoute(
  '/_internal-app/agent-settings/skills-context',
)({
  component: Page,
  validateSearch: (search: Record<string, unknown>) => ({
    workspace: (search.workspace as string) || '',
  }),
  head: () => ({
    meta: [
      {
        title: 'Skills & Context files',
      },
    ],
  }),
});

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

    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return { isOverflowing, tooltipOpen, setTooltipOpen };
}

// =============================================================================
// Workspace Subheader
// =============================================================================

function WorkspaceSubheader({ workspacePath }: { workspacePath: string }) {
  const folderName = useMemo(
    () => getBaseName(workspacePath) || workspacePath,
    [workspacePath],
  );

  return (
    <div className="flex flex-col">
      <span className="font-medium text-foreground text-sm">{folderName}</span>
      <span className="truncate text-subtle-foreground text-xs">
        {workspacePath}
      </span>
    </div>
  );
}

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
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

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
              value: { respectAgentsMd: false, disabledSkills: next },
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

function SkillsSection({
  workspaceMounts,
}: {
  workspaceMounts: Array<{
    path: string;
    skills: Array<{ name: string; description: string }>;
  }>;
}) {
  const hasSkills = workspaceMounts.some((m) => m.skills.length > 0);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-medium text-foreground text-lg">Skills</h2>
        <p className="text-muted-foreground text-sm">
          Enable or disable skills per workspace.
        </p>
      </div>
      {hasSkills ? (
        <div className="space-y-4">
          {workspaceMounts
            .filter((mount) => mount.skills.length > 0)
            .map((mount) => (
              <div key={mount.path} className="space-y-2">
                <WorkspaceSubheader workspacePath={mount.path} />
                <WorkspaceSkillsList
                  workspacePath={mount.path}
                  skills={mount.skills}
                />
              </div>
            ))}
        </div>
      ) : (
        <div className="rounded-lg border border-derived-subtle p-4">
          <p className="text-center text-muted-foreground text-sm">
            No skills detected in any connected workspace.
          </p>
        </div>
      )}
    </section>
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
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);
  const generateWorkspaceMd = useKartonProcedure((s) => s.generateWorkspaceMd);
  const isGenerating = useKartonState(
    (s) => !!s.workspaceMdGenerating[workspacePath],
  );

  const respectAgentsMd =
    preferences?.agent?.workspaceSettings?.[workspacePath]?.respectAgentsMd ??
    false;

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

function ContextFilesSection({
  workspaceMounts,
  contextFiles,
}: {
  workspaceMounts: Array<{
    path: string;
    workspaceMdContent: string | null;
    agentsMdContent: string | null;
  }>;
  contextFiles: ContextFilesResult | null;
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-medium text-foreground text-lg">Context files</h2>
        <p className="text-muted-foreground text-sm">
          Manage workspace context files used by the AI agent.
        </p>
      </div>
      {workspaceMounts.length > 0 ? (
        <div className="space-y-4">
          {workspaceMounts.map((mount) => (
            <div key={mount.path} className="space-y-2">
              <WorkspaceSubheader workspacePath={mount.path} />
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
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-derived-subtle p-4">
          <p className="text-center text-muted-foreground text-sm">
            No context files available.
          </p>
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

function Page() {
  const workspaceMounts = useKartonState((s) => s.workspaceMounts);
  const getContextFiles = useKartonProcedure((s) => s.getContextFiles);
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

  const hasWorkspaces = workspaceMounts.length > 0;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">
            Skills & Context files
          </h1>
          <p className="text-muted-foreground text-sm">
            Per-workspace configuration, context files, and skills for the
            stagewise agent.
          </p>
        </div>
      </div>

      {/* Content */}
      <OverlayScrollbar className="flex-1" contentClassName="px-6 pt-6 pb-24">
        <div className="mx-auto max-w-3xl">
          {!hasWorkspaces ? (
            <div className="rounded-lg border border-derived p-4">
              <p className="text-muted-foreground text-sm">
                No workspaces are currently connected. Connect a workspace to an
                agent to configure workspace-specific settings.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              <SkillsSection workspaceMounts={workspaceMounts} />
              <hr className="border-derived-subtle border-t" />
              <ContextFilesSection
                workspaceMounts={workspaceMounts}
                contextFiles={contextFiles}
              />
            </div>
          )}
        </div>
      </OverlayScrollbar>
    </div>
  );
}
