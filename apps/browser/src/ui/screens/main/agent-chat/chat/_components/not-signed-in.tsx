import { useKartonProcedure } from '@ui/hooks/use-karton';
import { Logo } from '@ui/components/ui/logo';
import { SignInOptionsPanel } from '@ui/components/auth/sign-in-options-panel';
import { useTrack } from '@ui/hooks/use-track';
import type { SocialAuthProvider } from '@shared/karton-contracts/ui/shared-types';

export function NotSignedIn() {
  const sendOtp = useKartonProcedure((p) => p.userAccount.sendOtp);
  const verifyOtp = useKartonProcedure((p) => p.userAccount.verifyOtp);
  const signInSocial = useKartonProcedure((p) => p.userAccount.signInSocial);
  const openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const track = useTrack();

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="mb-2 size-12" />
      <SignInOptionsPanel
        title="Authenticate"
        description="Get access to the latest models with stagewise."
        sendOtp={(email, token) => sendOtp(email, token ?? '')}
        verifyOtp={verifyOtp}
        signInSocial={(provider: SocialAuthProvider) => signInSocial(provider)}
        trackingPrefix="chat-auth"
        track={track}
        onUseApiKeys={() => void openSettings({ section: 'models-providers' })}
        onUseSubscription={() =>
          void openSettings({ section: 'models-providers' })
        }
      />
    </div>
  );
}
