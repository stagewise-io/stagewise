import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { CustomTaskItem } from './task-item-extension';
import { ShikiCodeBlock } from './shiki-code-block';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef, useCallback, useState } from 'react';
import { cn } from '@ui/utils';
import './markdown-editor.css';

const DEBOUNCE_MS = 300;
const SAVED_DISPLAY_MS = 2000;

interface MarkdownEditorProps {
  /** Raw markdown content */
  rawContent: string;
  /** Callback to persist the markdown */
  onSave: (content: string) => Promise<void>;
  className?: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function MarkdownEditor({
  rawContent,
  onSave,
  className,
}: MarkdownEditorProps) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const isMountedRef = useRef(true);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Reset to idle after "Saved" has been shown long enough
  useEffect(() => {
    if (saveStatus !== 'saved' && saveStatus !== 'error') return;

    const timer = setTimeout(() => setSaveStatus('idle'), SAVED_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const save = useCallback(async (markdown: string) => {
    setSaveStatus('saving');
    try {
      await onSaveRef.current(markdown);
      if (isMountedRef.current) setSaveStatus('saved');
    } catch {
      if (isMountedRef.current) setSaveStatus('error');
    }
  }, []);

  const debouncedSave = useCallback(
    (markdown: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(markdown), DEBOUNCE_MS);
    },
    [save],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
      }),
      ShikiCodeBlock,
      TaskList,
      CustomTaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        tightLists: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: rawContent,
    onUpdate: ({ editor: e }) => {
      const md = (e.storage as any).markdown.getMarkdown();
      debouncedSave(md);
    },
    editorProps: {
      attributes: {
        class: 'markdown-editor-content outline-none',
        spellcheck: 'false',
      },
    },
  });

  // Flush any pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current && editor) {
        clearTimeout(saveTimerRef.current);
        const md = (editor.storage as any).markdown.getMarkdown();
        // Fire-and-forget save
        onSaveRef.current(md).catch(() => {});
      }
    };
  }, [editor]);

  return (
    <div className={cn('relative', className)}>
      <EditorContent editor={editor} />
      <SaveIndicator status={saveStatus} />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <div
      className={cn(
        'fixed right-4 bottom-4 rounded-md px-3 py-1.5 text-xs',
        'bg-surface-2 text-muted-foreground shadow-sm',
        'transition-opacity duration-300',
        status === 'saved' && 'animate-fade-out',
        status === 'error' && 'text-red-400',
      )}
    >
      {status === 'saving' && 'Saving…'}
      {status === 'saved' && 'Saved'}
      {status === 'error' && 'Save failed'}
    </div>
  );
}
