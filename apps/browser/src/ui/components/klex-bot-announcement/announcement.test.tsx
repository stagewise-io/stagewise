import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANNOUNCEMENT_REMINDER_MS,
  klexBotAnnouncementSchema,
  type KlexBotAnnouncementState,
} from '@shared/klex-bot-announcement';
import { ScreenRouter } from '@ui/screens';
import { KlexBotAnnouncementProvider } from './controller';
import { StartupDialogs } from './startup-dialogs';
import { KlexBotAnnouncementCard } from '@ui/screens/main/sidebar/klex-bot-announcement-card';

const mock = vi.hoisted(() => ({
  state: null as KlexBotAnnouncementState | null,
  listeners: new Set<() => void>(),
  claim: vi.fn(),
  dismiss: vi.fn(),
  openExternalUrl: vi.fn(),
  tutorial: null as object | null,
  onboarded: true as boolean | null,
}));

vi.mock('@ui/hooks/use-karton', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useKartonConnected: () => true,
    useKartonReconnectState: () => ({ isReconnecting: false, failed: false }),
    useKartonState: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(
        (listener) => {
          mock.listeners.add(listener);
          return () => mock.listeners.delete(listener);
        },
        () =>
          selector({
            userExperience: {
              storedExperienceData: {
                klexBotAnnouncement: mock.state,
                hasSeenOnboardingFlow: mock.onboarded,
              },
            },
          }),
      ),
    useKartonProcedure: (selector: (p: unknown) => unknown) =>
      selector({
        openExternalUrl: mock.openExternalUrl,
        userExperience: {
          klexBotAnnouncement: {
            claimInitialPresentation: mock.claim,
            dismiss: mock.dismiss,
          },
        },
      }),
  };
});
vi.mock('@ui/screens/main', () => ({
  DefaultLayout: () => <KlexBotAnnouncementCard />,
}));
vi.mock('@ui/screens/onboarding', () => ({
  OnboardingWizard: () => <div>Onboarding</div>,
}));
vi.mock('@ui/components/web-contents-bounds-syncer', () => ({
  WebContentsBoundsSyncer: () => null,
}));
vi.mock('@ui/components/tutorial/tutorial-overlay', () => ({
  TutorialOverlay: () => null,
}));
vi.mock('@ui/components/ui/logo', () => ({ Logo: () => null }));
vi.mock('@ui/contexts/tutorial', () => ({
  useTutorial: () => ({ activeTutorial: mock.tutorial }),
}));
vi.mock('../../../../../../.release-notes.md?raw', () => ({
  default: '## 0.0.0-test (2026-08-03)\n\n### Features\n\n* Test',
}));

function publish(state: KlexBotAnnouncementState | null) {
  mock.state = state;
  mock.listeners.forEach((listener) => listener());
}

function App({ sidebar = true }: { sidebar?: boolean }) {
  return (
    <KlexBotAnnouncementProvider>
      {sidebar && <KlexBotAnnouncementCard />}
      <StartupDialogs />
    </KlexBotAnnouncementProvider>
  );
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const card = () =>
  screen.queryByRole('button', { name: 'Say Hello to Klex Bots' });
const dialog = () =>
  screen.queryByRole('dialog', { name: 'Say Hello to Klex Bots' });
const dismissButton = () =>
  screen.getByRole('button', { name: 'Dismiss Klex Bot announcement' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  localStorage.setItem('stagewise-whats-new-version', '0.0.0-test');
  mock.state = klexBotAnnouncementSchema.parse({});
  mock.tutorial = null;
  mock.onboarded = true;
  mock.openExternalUrl.mockReset();
  mock.claim.mockReset().mockImplementation(async () => {
    if (
      !mock.state ||
      mock.state.initialPresentationConsumed ||
      mock.state.permanentlyDismissed
    )
      return false;
    publish({ ...mock.state, initialPresentationConsumed: true });
    return true;
  });
  mock.dismiss.mockReset().mockImplementation(async (choice: string) => {
    publish({
      initialPresentationConsumed: true,
      permanentlyDismissed: choice === 'never',
      remindAt:
        choice === 'remind' ? Date.now() + ANNOUNCEMENT_REMINDER_MS : null,
    });
  });
});

afterEach(() => {
  cleanup();
  mock.listeners.clear();
  localStorage.clear();
  vi.useRealTimers();
});

describe('Klex Bot announcement lifecycle', () => {
  it('shows the announcement content and opens the Klex Bot creation page', async () => {
    render(<App />);
    await flush(200);
    expect(
      screen.getByRole('heading', { name: 'Say Hello to Klex Bots' }),
    ).toBeTruthy();
    expect(screen.getByText(/not another chat to manage/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create your first Klex Bot' }),
    );
    expect(mock.openExternalUrl).toHaveBeenCalledWith('https://klex.bot');
    expect(dialog()).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close Klex Bot announcement'));
    await flush(200);
    expect(card()).toBeTruthy();
    expect(
      screen.getByText(
        'Meet open-source digital coworkers that take coding tasks from issue to pull request.',
      ),
    ).toBeTruthy();
    const image = card()!.querySelector('img');
    expect(image?.getAttribute('src')).toContain('klex-wink.webp');
    expect(image?.classList.contains('-scale-x-100')).toBe(true);
  });

  it('does not claim during loading or onboarding and opens on entering the IDE', async () => {
    mock.onboarded = null;
    const view = render(<ScreenRouter />);
    await flush();
    expect(mock.claim).not.toHaveBeenCalled();
    mock.onboarded = false;
    view.rerender(<ScreenRouter />);
    await flush();
    expect(screen.getByText('Onboarding')).toBeTruthy();
    expect(mock.claim).not.toHaveBeenCalled();
    mock.onboarded = true;
    view.rerender(<ScreenRouter />);
    await flush();
    await flush();
    expect(dialog()).toBeTruthy();
    expect(mock.claim).toHaveBeenCalledTimes(1);
  });

  it('waits for loaded state and tutorials, then auto-opens once even in StrictMode', async () => {
    mock.state = null;
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await flush();
    expect(dialog()).toBeNull();
    expect(card()).toBeNull();
    expect(mock.claim).not.toHaveBeenCalled();
    mock.tutorial = {};
    act(() => publish(klexBotAnnouncementSchema.parse({})));
    view.rerender(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await flush();
    expect(mock.claim).not.toHaveBeenCalled();
    mock.tutorial = null;
    view.rerender(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await flush();
    expect(dialog()).toBeTruthy();
    expect(document.getElementById('klex-bot-announcement-open')).toBeTruthy();
    expect(mock.claim).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Klex Bot announcement' }),
    );
    await flush(200);
    expect(dialog()).toBeNull();
    expect(card()).toBeTruthy();
    // Unrelated state broadcasts must not replay the resolved initial claim.
    act(() => publish({ ...mock.state! }));
    await flush();
    expect(dialog()).toBeNull();
    view.unmount();
    render(<App />);
    await flush();
    expect(dialog()).toBeNull();
    expect(card()).toBeTruthy();
    expect(mock.claim).toHaveBeenCalledTimes(1);
  });

  it.each([
    'close',
    'escape',
    'backdrop',
  ] as const)('closing via %s keeps the sidebar card mounted without saving a dismissal', async (method) => {
    render(<App />);
    await flush(200);
    const sidebarCard = document.getElementById('klex-bot-announcement-open');
    expect(sidebarCard).toBeTruthy();
    if (method === 'close')
      fireEvent.click(screen.getByLabelText('Close Klex Bot announcement'));
    if (method === 'escape') fireEvent.keyDown(dialog()!, { key: 'Escape' });
    if (method === 'backdrop') {
      const backdrop =
        document.querySelector(
          '[data-base-ui-portal] > [role="presentation"]',
        ) ?? document.querySelector('[class*="bg-overlay"]');
      expect(backdrop).toBeTruthy();
      fireEvent.mouseDown(backdrop!);
      fireEvent.mouseUp(backdrop!);
      fireEvent.click(backdrop!);
    }
    await flush(200);
    expect(dialog()).toBeNull();
    expect(card()).toBeTruthy();
    expect(mock.dismiss).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(card());
    expect(card()).toBe(sidebarCard);
    fireEvent.click(card()!);
    await flush(200);
    expect(dialog()).toBeTruthy();
    expect(document.getElementById('klex-bot-announcement-open')).toBe(
      sidebarCard,
    );
    expect(mock.claim).toHaveBeenCalledTimes(1);
  });

  it('cancels the dismiss choice without opening the announcement or saving', async () => {
    mock.state = klexBotAnnouncementSchema.parse({
      initialPresentationConsumed: true,
    });
    render(<App />);
    await flush();
    fireEvent.click(dismissButton());
    await flush(200);
    expect(
      screen.getByRole('menu', { name: 'Dismiss Klex Bot announcement' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Remind me in 7 days' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: "Don't show me again" }),
    ).toBeTruthy();
    expect(screen.queryByText('Dismiss announcement')).toBeNull();
    expect(dialog()).toBeNull();
    fireEvent.keyDown(screen.getByText('Remind me in 7 days'), {
      key: 'Escape',
    });
    await flush(200);
    expect(card()).toBeTruthy();
    expect(mock.dismiss).not.toHaveBeenCalled();
    expect(screen.queryByText('Remind me in 7 days')).toBeNull();
  });

  it('snoozes for seven days and restores only the card while idle, across collapse and restart', async () => {
    mock.state = klexBotAnnouncementSchema.parse({
      initialPresentationConsumed: true,
    });
    const view = render(<App />);
    await flush();
    fireEvent.click(dismissButton());
    await flush(200);
    fireEvent.click(screen.getByText('Remind me in 7 days'));
    await flush(200);
    expect(card()).toBeNull();
    const deadline = mock.state!.remindAt!;
    view.rerender(<App sidebar={false} />);
    await flush(deadline - Date.now() - 1);
    view.rerender(<App />);
    expect(card()).toBeNull();
    await flush(1);
    expect(card()).toBeTruthy();
    expect(dialog()).toBeNull();
    view.unmount();
    render(<App />);
    await flush();
    expect(card()).toBeTruthy();
    expect(dialog()).toBeNull();
    expect(mock.claim).not.toHaveBeenCalled();
  });

  it('refreshes on resume/focus without automatically opening the dialog', async () => {
    mock.state = klexBotAnnouncementSchema.parse({
      initialPresentationConsumed: true,
      remindAt: Date.now() + ANNOUNCEMENT_REMINDER_MS,
    });
    render(<App />);
    await flush();
    expect(card()).toBeNull();
    vi.setSystemTime(Date.now() + ANNOUNCEMENT_REMINDER_MS);
    fireEvent.focus(window);
    await flush();
    expect(card()).toBeTruthy();
    expect(dialog()).toBeNull();
  });

  it('persists permanent dismissal across remounts regardless of release-note version', async () => {
    mock.state = klexBotAnnouncementSchema.parse({
      initialPresentationConsumed: true,
    });
    const view = render(<App />);
    await flush();
    fireEvent.click(dismissButton());
    await flush(200);
    fireEvent.click(screen.getByText("Don't show me again"));
    await flush(200);
    expect(card()).toBeNull();
    view.unmount();
    localStorage.setItem('stagewise-whats-new-version', 'another-version');
    render(<App />);
    await flush(ANNOUNCEMENT_REMINDER_MS * 2);
    expect(card()).toBeNull();
    expect(dialog()).toBeNull();
    expect(mock.claim).not.toHaveBeenCalled();
  });

  it('retains the card and choice on save failure, disables duplicate submissions, and retries', async () => {
    mock.state = klexBotAnnouncementSchema.parse({
      initialPresentationConsumed: true,
    });
    mock.dismiss.mockRejectedValueOnce(new Error('disk full'));
    render(<App />);
    await flush();
    fireEvent.click(dismissButton());
    await flush(200);
    fireEvent.click(screen.getByText('Remind me in 7 days'));
    await flush();
    expect(card()).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Please retry');
    expect(screen.getByText('Remind me in 7 days')).toBeTruthy();
    let finish!: () => void;
    mock.dismiss.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      publish({
        ...mock.state!,
        remindAt: Date.now() + ANNOUNCEMENT_REMINDER_MS,
      });
    });
    fireEvent.click(screen.getByText('Remind me in 7 days'));
    fireEvent.click(screen.getByText('Remind me in 7 days'));
    expect(mock.dismiss).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish();
    });
    await flush(200);
    expect(mock.dismiss).toHaveBeenCalledTimes(2);
    expect(card()).toBeNull();
  });

  it('offers an explicit retry after an initial claim fails', async () => {
    mock.claim.mockRejectedValueOnce(new Error('disk full'));
    render(<App />);
    await flush();
    expect(dialog()).toBeNull();
    expect(card()).toBeTruthy();
    fireEvent.click(card()!);
    await flush();
    expect(dialog()).toBeTruthy();
    expect(mock.claim).toHaveBeenCalledTimes(2);
  });

  it('defers changelog without marking it seen and never stacks startup dialogs', async () => {
    localStorage.clear();
    render(<App />);
    await flush(200);
    expect(dialog()).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'What’s new' })).toBeNull();
    expect(localStorage.getItem('stagewise-whats-new-version')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Klex Bot announcement' }),
    );
    await flush(200);
    expect(dialog()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'What’s new' })).toBeTruthy();
    expect(localStorage.getItem('stagewise-whats-new-version')).toBeNull();
    fireEvent.click(screen.getByText('Got it'));
    await flush(200);
    expect(localStorage.getItem('stagewise-whats-new-version')).toBe(
      '0.0.0-test',
    );
    fireEvent.click(card()!);
    await flush(200);
    expect(dialog()).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'What’s new' })).toBeNull();
  });
});
