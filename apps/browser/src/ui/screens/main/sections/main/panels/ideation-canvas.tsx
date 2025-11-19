import { useKartonState } from '@/hooks/use-karton';

export const IdeationCanvasPanel = () => {
  const inspirationComponents =
    useKartonState((state) => state.workspace?.inspirationComponents) ?? [];

  return (
    <div className="glass-body flex size-full flex-col gap-8 rounded-xl bg-black/5 p-4">
      <h2 className="font-medium text-lg">Ideation Canvas</h2>
      {inspirationComponents?.length === 0 && (
        <div className="flex size-full items-center justify-center text-foreground/70 text-sm">
          Nothing to see :o
        </div>
      )}
      {inspirationComponents?.length > 0 && (
        <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {inspirationComponents?.map((component) => (
            <div
              key={component.id}
              className="glass-body flex flex-col items-stretch justify-start gap-2 rounded-2xl bg-background/40 p-3"
            >
              <iframe
                src={`/stagewise-toolbar-app/component-canvas/preview-compiled/${component.id}`}
                className="glass-inset aspect-square w-full flex-1 rounded-lg"
                title={'stagewise component preview'}
              />
              <p className="font-medium text-base text-foreground">
                {component.id}
              </p>
              <p className="-mt-2 text-muted-foreground text-sm">
                {component.createdAt.toLocaleDateString('en-US', {
                  year: '2-digit',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
