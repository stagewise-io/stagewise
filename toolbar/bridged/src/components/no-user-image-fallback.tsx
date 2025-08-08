import { User } from 'lucide-react';

export function NoUserImageFallback() {
  return (
    <div className="flex size-full items-center justify-center bg-zinc-500 font-bold text-base text-white">
      <User size="size-2/3" />
    </div>
  );
}
