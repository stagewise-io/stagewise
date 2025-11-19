import { RagStatusArea } from './_components/rag-status';

export function SidebarSubsystemStatusSection() {
  return (
    <div className="flex shrink-0 flex-row flex-wrap items-center justify-start gap-2 p-4">
      <RagStatusArea />
    </div>
  );
}
