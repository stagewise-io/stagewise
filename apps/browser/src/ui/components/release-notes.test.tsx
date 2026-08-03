import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../.release-notes.md?raw', () => ({
  default: '## 0.0.0-test (2026-08-03)\n\n### Features\n\n* Test',
}));

describe('WhatsNewDialog', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stays closed after onboarding marks the current version as seen', async () => {
    vi.resetModules();
    const { markCurrentReleaseNotesSeen, WhatsNewDialog } = await import(
      './release-notes'
    );

    const beforeOnboardingCompletion = render(<WhatsNewDialog />);
    expect(await screen.findByText('What’s new')).toBeTruthy();
    beforeOnboardingCompletion.unmount();

    markCurrentReleaseNotesSeen();
    render(<WhatsNewDialog />);

    expect(screen.queryByText('What’s new')).toBeNull();
  });
});
