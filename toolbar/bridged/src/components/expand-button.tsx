import { useAppState } from '@/hooks/use-app-state';
import { Logo } from './ui/logo.js';

export function ExpandButton() {
  const { expand } = useAppState();

  return (
    <button
      type="button"
      onClick={() => expand()}
      className="pointer-events-auto absolute bottom-3 left-3 size-12 rounded-full bg-transparent opacity-80 shadow-sm transition-all duration-500 hover:opacity-100 hover:shadow-lg"
    >
      <Logo color="gradient" />
    </button>
  );
}
