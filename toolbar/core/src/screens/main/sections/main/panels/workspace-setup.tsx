import Iridescence from '@/components/ui/iridescence';
import { Logo } from '@/components/ui/logo';

export function WorkspaceSetupPanel() {
  return (
    <div className="glass-body flex size-full flex-col items-center justify-center overflow-hidden rounded-xl">
      <Iridescence
        className="absolute inset-0 size-full"
        color={[0.9, 0.8, 1]}
        speed={0.5}
      />
      <Logo
        className="z-10 w-1/4 max-w-24 drop-shadow-black/30 drop-shadow-xl"
        color="white"
      />
    </div>
  );
}
