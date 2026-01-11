import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useKartonProcedure } from '@/hooks/use-karton';
import { useEffect, useState, useRef } from 'react';
import { Loader2Icon } from 'lucide-react';

type AuthCallbackSearch = {
  authCode?: string;
  error?: string;
};

export const Route = createFileRoute('/_callbacks/auth/callback')({
  component: Page,
  validateSearch: (search: Record<string, unknown>): AuthCallbackSearch => ({
    authCode: search.authCode as string | undefined,
    error: search.error as string | undefined,
  }),
  head: () => ({
    meta: [
      {
        title: 'Authenticating...',
      },
    ],
  }),
});

function Page() {
  const { authCode, error } = useSearch({ from: '/_callbacks/auth/callback' });
  const handleAuthCallback = useKartonProcedure((p) => p.handleAuthCallback);
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>(
    'processing',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate calls (React StrictMode runs effects twice)
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const processAuth = async () => {
      try {
        await handleAuthCallback(authCode, error);
        setStatus('success');
        // The tab will be closed by AuthService after successful auth
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Authentication failed',
        );
      }
    };

    processAuth();
  }, [authCode, error, handleAuthCallback]);

  return (
    <div className="flex h-full min-h-screen w-full min-w-screen flex-col items-center justify-center gap-4 p-6">
      {status === 'processing' && (
        <>
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Completing sign in...</p>
        </>
      )}

      {status === 'success' && (
        <p className="text-muted-foreground">
          Sign in successful! This tab will close automatically.
        </p>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-medium text-destructive">Sign in failed</p>
          {errorMessage && (
            <p className="text-muted-foreground text-sm">{errorMessage}</p>
          )}
          <p className="text-muted-foreground text-sm">
            Please close this tab and try again.
          </p>
        </div>
      )}
    </div>
  );
}
