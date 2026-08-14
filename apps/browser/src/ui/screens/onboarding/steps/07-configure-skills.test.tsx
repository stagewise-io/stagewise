import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updatePreferences: vi.fn(),
  state: {
    globalSkills: [
      {
        name: 'codex-skill-one',
        description: 'First Codex skill',
        mountPrefix: 'globalskills-codex',
      },
      {
        name: 'codex-skill-two',
        description: 'Second Codex skill',
        mountPrefix: 'globalskills-codex',
      },
      {
        name: 'stagewise-skill',
        description: 'Stagewise skill',
        mountPrefix: 'globalskills-sw',
      },
    ],
    preferences: {
      agent: {
        enabledGlobalSkillDirs: [] as string[],
      },
    },
  },
}));

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn((selector) => selector(mocks.state)),
  useKartonProcedure: vi.fn((selector) =>
    selector({ preferences: { update: mocks.updatePreferences } }),
  ),
}));

import {
  StepConfigureSkills,
  type ExternalSkillSourceSelection,
} from './07-configure-skills';

function renderStep(selection: ExternalSkillSourceSelection = {}) {
  const onNext = vi.fn();
  render(
    <StepConfigureSkills
      selection={selection}
      onSelectionChange={vi.fn()}
      onNext={onNext}
      onBack={vi.fn()}
    />,
  );
  return { onNext };
}

describe('StepConfigureSkills', () => {
  beforeEach(() => {
    mocks.updatePreferences.mockReset();
    mocks.updatePreferences.mockResolvedValue(undefined);
    mocks.state.preferences.agent.enabledGlobalSkillDirs = [];
  });

  it('shows only detected external sources and enables them by default', () => {
    renderStep();

    expect(screen.getByText('~/.codex/skills · 2 skills')).toBeTruthy();
    expect(screen.queryByText('Claude Code')).toBeNull();
    expect(
      screen
        .getByRole('switch', { name: 'Use Codex skills' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('persists detected sources before continuing', async () => {
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(mocks.updatePreferences).toHaveBeenCalledWith([
        {
          op: 'replace',
          path: ['agent', 'enabledGlobalSkillDirs'],
          value: ['globalskills-codex'],
        },
      ]);
    });
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('respects a disabled selection and preserves unrelated sources', async () => {
    mocks.state.preferences.agent.enabledGlobalSkillDirs = [
      'globalskills-codex',
      'globalskills-custom',
    ];

    renderStep({ 'globalskills-codex': false });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(mocks.updatePreferences).toHaveBeenCalledWith([
        {
          op: 'replace',
          path: ['agent', 'enabledGlobalSkillDirs'],
          value: ['globalskills-custom'],
        },
      ]);
    });
  });

  it('locks navigation while preferences are being saved', async () => {
    let finishSaving!: () => void;
    mocks.updatePreferences.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSaving = resolve;
      }),
    );
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled'),
      ).toBe(true);
    });
    expect(
      screen
        .getByRole('button', { name: 'Saving...' })
        .hasAttribute('disabled'),
    ).toBe(true);

    await act(async () => finishSaving());
    expect(onNext).toHaveBeenCalledOnce();
  });
});
