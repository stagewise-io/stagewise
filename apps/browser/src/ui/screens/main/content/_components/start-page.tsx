import StagewiseLogo from '@/assets/stagewise/logo.png';

export function StartPage() {
  return (
    <div className="flex size-full flex-col items-center justify-center overflow-hidden bg-background py-12">
      <div className="flex items-center justify-center gap-4">
        <img src={StagewiseLogo} alt="Stagewise Logo" className="size-8" />
        <h1 className="font-semibold text-2xl">Welcome to stagewise.</h1>
      </div>
    </div>
  );
}
