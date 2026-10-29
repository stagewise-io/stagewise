import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTutorial } from '@ui/contexts/tutorial';
import {
  isAnnouncementCardEligible,
  type AnnouncementDismissal,
} from '@shared/klex-bot-announcement';

interface AnnouncementContextValue {
  cardVisible: boolean;
  dialogOpen: boolean;
  busy: boolean;
  error: string | null;
  startupBlocked: boolean;
  setChangelogVisible: (visible: boolean) => void;
  open: () => void;
  close: () => void;
  dismiss: (choice: AnnouncementDismissal) => Promise<boolean>;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(
  null,
);

export function useKlexBotAnnouncement() {
  const value = useContext(AnnouncementContext);
  if (!value) throw new Error('Klex Bot announcement provider is missing');
  return value;
}

export function KlexBotAnnouncementProvider({
  children,
}: {
  children: ReactNode;
}) {
  const state = useKartonState(
    (s) => s.userExperience.storedExperienceData.klexBotAnnouncement,
  );
  const claim = useKartonProcedure(
    (p) => p.userExperience.klexBotAnnouncement.claimInitialPresentation,
  );
  const saveDismissal = useKartonProcedure(
    (p) => p.userExperience.klexBotAnnouncement.dismiss,
  );
  const { activeTutorial } = useTutorial();
  const safe = activeTutorial === null;
  const [now, setNow] = useState(Date.now);
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [changelogVisible, setChangelogVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [claimSettled, setClaimSettled] = useState(false);
  const claimPromise = useRef<Promise<boolean> | null>(null);
  const claimHandled = useRef(false);
  const [ready, setReady] = useState(false);

  // Let tutorial registration microtasks settle before claiming startup UI.
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!state || !ready || !safe || claimHandled.current) return;
    if (
      !claimPromise.current &&
      (state.initialPresentationConsumed || state.permanentlyDismissed)
    ) {
      setClaimSettled(true);
      return;
    }
    claimPromise.current ??= claim();
    let cancelled = false;
    // Reuse the promise on effect replay, including React StrictMode. A state
    // broadcast may arrive before the claim response; it must not lose it.
    void claimPromise.current.then(
      (claimed) => {
        if (cancelled || claimHandled.current) return;
        claimHandled.current = true;
        if (claimed) setRequestedOpen(true);
        setClaimSettled(true);
      },
      () => {
        if (cancelled || claimHandled.current) return;
        claimHandled.current = true;
        setError('Could not save announcement state. Please retry.');
        setClaimSettled(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state, ready, safe, claim]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      setNow(Date.now());
      const delay = (state?.remindAt ?? 0) - Date.now();
      if (delay > 0)
        timer = setTimeout(refresh, Math.min(delay, 2_147_483_647));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [state?.remindAt]);

  const dialogOpen =
    requestedOpen && safe && !changelogVisible && !state?.permanentlyDismissed;
  const cardVisible =
    claimSettled &&
    state !== null &&
    (isAnnouncementCardEligible(state, now) ||
      !state.initialPresentationConsumed) &&
    !state?.permanentlyDismissed;

  const open = () => {
    if (busyRef.current || !safe || changelogVisible) return;
    if (state?.initialPresentationConsumed) {
      setRequestedOpen(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    void claim()
      .then(
        () => {
          setRequestedOpen(true);
        },
        () => {
          setError('Could not save announcement state. Please retry.');
        },
      )
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };

  const dismiss = async (choice: AnnouncementDismissal) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await saveDismissal(choice);
      setNow(Date.now());
      return true;
    } catch {
      setError('Could not save your choice. Please retry.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AnnouncementContext.Provider
      value={{
        cardVisible,
        dialogOpen,
        busy: busy || changelogVisible || !safe,
        error,
        setChangelogVisible,
        startupBlocked:
          !ready ||
          !safe ||
          !state ||
          !claimSettled ||
          (requestedOpen && !state.permanentlyDismissed),
        open,
        close: () => setRequestedOpen(false),
        dismiss,
      }}
    >
      {children}
    </AnnouncementContext.Provider>
  );
}
