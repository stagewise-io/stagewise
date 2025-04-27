import { useAppState } from "@/hooks/use-app-state";

export function ExpandButton() {
  const expand = useAppState((state) => state.expand);

  return (
    <button
      onClick={() => expand()}
      className="bg-transparent rounded-full pointer-events-auto absolute bottom-3 left-3 size-10 opacity-60 shadow-sm transition-all duration-500 hover:opacity-100 hover:shadow-lg"
    >
      Expand
    </button>
  );
}
