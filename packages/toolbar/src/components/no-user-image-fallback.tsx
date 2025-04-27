import { User } from "lucide-react";

export function NoUserImageFallback() {
  return (
    <div className="flex size-full items-center justify-center bg-zinc-500 text-base font-bold text-white">
      <User size="size-2/3" />
    </div>
  );
}
