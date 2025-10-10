import flappyGame from '@stagewise/flappy-game/index.html?raw';

export function EddyModePanel() {
  return (
    <div className="glass-body flex size-full flex-col items-stretch justify-start overflow-hidden rounded-xl bg-gradient-to-br from:bg-white/80 to:bg-white/80 via:bg-zinc-50/80 dark:from:bg-black/80 dark:to:bg-black/80 dark:via:bg-zinc-950/80">
      <iframe
        srcDoc={flappyGame}
        title="Flappy Game"
        className="aspect-[1/1.5] max-h-[50vh] w-3/4 rounded-2xl ring-2 ring-black"
      />
    </div>
  );
}
