import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonProcedure, useKartonState } from '@pages/hooks/use-karton';
import { MarkdownEditor } from '@ui/components/markdown-editor/markdown-editor';
import { Button } from '@stagewise/stage-ui/components/button';

export const Route = createFileRoute('/plan/$filename')({
  component: PlanPage,
});

function PlanPage() {
  const { filename } = Route.useParams();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savePlanFile = useKartonProcedure((p) => p.savePlanFile);

  const fetchUrl = `plans://plans/${filename}`;

  // Subscribe to the plan metadata from Karton state.
  // When the agent updates the plan file on disk, chokidar detects the change
  // and pushes new metadata (task counts, groups) into Karton state.
  // We use this as an invalidation signal to re-fetch the full file content.
  const planMeta = useKartonState((s) => {
    return s.plans.find((p) => p.filename === filename);
  });

  // Track the last content we saved ourselves so we can skip re-fetches
  // triggered by our own writes (which also cause chokidar → metadata update).
  const lastSavedContentRef = useRef<string | null>(null);

  // Revision counter bumped on external changes to force PlanEditor remount.
  const [revision, setRevision] = useState(0);

  // Fetch file content. Runs on initial load and whenever planMeta changes
  // (i.e. the backend detected a file change on disk).
  useEffect(() => {
    let cancelled = false;

    const fetchContent = async () => {
      try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error('Failed to load plan');
        const text = await response.text();
        if (cancelled) return;

        // If the fetched content matches what we last saved, skip the update
        // to avoid resetting the editor after the user's own edits.
        if (lastSavedContentRef.current === text) return;

        setContent(text);
        setRevision((r) => r + 1);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };

    fetchContent();
    return () => {
      cancelled = true;
    };
  }, [fetchUrl, planMeta]);

  const handleSave = useCallback(
    async (fullContent: string) => {
      // Record what we're saving so we can ignore the subsequent
      // chokidar-triggered re-fetch for this exact content.
      lastSavedContentRef.current = fullContent;
      await savePlanFile(filename, fullContent);
    },
    [savePlanFile, filename],
  );

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
        <h1 className="font-semibold text-xl">Plan not available</h1>
        <p className="text-muted-foreground text-sm">
          The plan file could not be loaded.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground! hover:text-hover-derived! active:text-active-derived!"
          style={
            {
              '--cm-text-color': 'var(--color-primary-foreground)',
            } as CSSProperties
          }
          onClick={() => window.close()}
        >
          Close tab
        </Button>
      </div>
    );
  }

  if (content === null) {
    return <div className="p-4 text-muted-foreground">Loading…</div>;
  }

  return (
    <OverlayScrollbar
      className="h-screen w-full bg-background p-8 text-foreground text-sm"
      contentClassName="flex justify-center"
    >
      <div className="mt-8 mb-32 w-full max-w-3xl">
        <MarkdownEditor
          key={revision}
          rawContent={content}
          onSave={handleSave}
        />
      </div>
    </OverlayScrollbar>
  );
}
