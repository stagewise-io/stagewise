import { Switch } from '@stagewise/stage-ui/components/switch';
import {
  EXTERNAL_GLOBAL_SKILL_SOURCES,
  type ExternalGlobalSkillSourcePrefix,
} from '@shared/global-skill-prefixes';
import type { AppState } from '@shared/karton-contracts/ui';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useState } from 'react';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

export type ExternalSkillSourceSelection = Partial<
  Record<ExternalGlobalSkillSourcePrefix, boolean>
>;

type GlobalSkill = AppState['globalSkills'][number];

export function hasDetectedExternalSkills(skills: GlobalSkill[]): boolean {
  return EXTERNAL_GLOBAL_SKILL_SOURCES.some((source) =>
    skills.some((skill) => skill.mountPrefix === source.prefix),
  );
}

export function StepConfigureSkills({
  selection,
  onSelectionChange,
  onNext,
  onBack,
}: {
  selection: ExternalSkillSourceSelection;
  onSelectionChange: (
    prefix: ExternalGlobalSkillSourcePrefix,
    enabled: boolean,
  ) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const globalSkills = useKartonState((s) => s.globalSkills);
  const enabledGlobalSkillDirs = useKartonState(
    (s) => s.preferences.agent.enabledGlobalSkillDirs,
  );
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const detectedSources = EXTERNAL_GLOBAL_SKILL_SOURCES.flatMap((source) => {
    const skillCount = globalSkills.filter(
      (skill) => skill.mountPrefix === source.prefix,
    ).length;
    return skillCount > 0 ? [{ ...source, skillCount }] : [];
  });

  async function handleNext() {
    setIsSaving(true);
    setSaveError(null);

    const nextEnabledDirs = [
      ...enabledGlobalSkillDirs.filter(
        (prefix) => !detectedSources.some((source) => source.prefix === prefix),
      ),
      ...detectedSources.flatMap((source) =>
        selection[source.prefix] !== false ? [source.prefix] : [],
      ),
    ];

    try {
      await updatePreferences([
        {
          op: 'replace',
          path: ['agent', 'enabledGlobalSkillDirs'],
          value: nextEnabledDirs,
        },
      ]);
      onNext();
    } catch {
      setSaveError('Could not save your skill sources. Please try again.');
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center justify-center overflow-hidden px-8 py-8">
        <div className="flex w-full max-w-xl flex-col gap-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="font-medium text-foreground text-xl">
              Use your existing skills
            </h1>
            <p className="max-w-md text-muted-foreground text-sm">
              We found skills from other coding agents. Enable the sources you
              want stagewise to use.
            </p>
          </div>

          <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-derived bg-surface-1">
            {detectedSources.map((source) => (
              <div key={source.prefix} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm">
                    {source.label}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {source.directory} · {source.skillCount}{' '}
                    {source.skillCount === 1 ? 'skill' : 'skills'}
                  </p>
                </div>
                <Switch
                  checked={selection[source.prefix] !== false}
                  onCheckedChange={(enabled) =>
                    onSelectionChange(source.prefix, enabled)
                  }
                  size="sm"
                  aria-label={`Use ${source.label} skills`}
                />
              </div>
            ))}
          </div>

          {saveError ? (
            <p
              role="alert"
              className="text-center text-error-foreground text-xs"
            >
              {saveError}
            </p>
          ) : null}
        </div>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} disabled={isSaving} />}
        right={
          <NextButton
            onClick={() => void handleNext()}
            label={isSaving ? 'Saving...' : 'Next'}
            disabled={isSaving}
          />
        }
      />
    </>
  );
}
