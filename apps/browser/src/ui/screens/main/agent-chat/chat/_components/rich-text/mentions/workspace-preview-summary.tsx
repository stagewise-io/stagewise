import { IconCodeBranchOutline18 } from 'nucleo-ui-outline-18';
import { CheckIcon, XIcon } from 'lucide-react';
import type { MountEntry } from '@shared/karton-contracts/ui';

interface WorkspacePreviewSummaryProps {
  mount: MountEntry;
  name: string;
}

export function WorkspacePreviewSummary({
  mount,
  name,
}: WorkspacePreviewSummaryProps) {
  const hasSkills = mount.skills.length > 0;

  return (
    <div className="flex flex-col text-xs">
      {/* Header: folder name + git badge + path */}
      <div className="flex flex-col items-start gap-0.5">
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
      <div className="mt-2 flex flex-col gap-1 border-derived-subtle border-t pt-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground text-xs">
            Context files
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {mount.workspaceMdContent !== null ? (
            <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <XIcon className="size-3 shrink-0 text-subtle-foreground" />
          )}
          <span
            className={
              mount.workspaceMdContent !== null
                ? 'flex-1 px-0 text-muted-foreground text-xs'
                : 'flex-1 px-0 text-subtle-foreground text-xs'
            }
          >
            WORKSPACE.md
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {mount.agentsMdContent !== null ? (
            <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <XIcon className="size-3 shrink-0 text-subtle-foreground" />
          )}
          <span
            className={
              mount.agentsMdContent !== null
                ? 'flex-1 px-0 text-muted-foreground text-xs'
                : 'flex-1 px-0 text-subtle-foreground text-xs'
            }
          >
            AGENTS.md
          </span>
        </div>
      </div>

      {/* Skills section */}
      {hasSkills && (
        <div className="mt-2 flex flex-col gap-1 border-derived-subtle border-t pt-2">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground text-xs">Skills</span>
          </div>
          {mount.skills
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((skill) => (
              <span
                key={skill.name}
                className="truncate text-muted-foreground text-xs leading-normal"
              >
                {skill.name}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
