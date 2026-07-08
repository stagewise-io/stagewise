import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { SearchableSelect } from '@stagewise/stage-ui/components/searchable-select';
import { Select } from '@stagewise/stage-ui/components/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import type {
  FilePreviewResult,
  FileStatResult,
  TabState,
} from '@shared/karton-contracts/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { IconDatabaseFillDuo18 } from '@stagewise/icons';
import type { FileDiffContent } from '@shared/karton-contracts/ui';
import {
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import {
  IconFloppyDiskOutline18,
  IconLockKeyOutline18,
  IconArrowsToCenterOutline18,
  IconColorPaletteOutline18,
  IconEye2Outline18,
  IconOpenExternalOutline18,
  IconRedoOutline18,
  IconSplitViewOutline18,
  IconSquareCodeOutline18,
  IconTextAlignLeft2Outline18,
  IconTextBgColorOutline18,
  IconTextColorOutline18,
  IconUndoOutline18,
} from '@stagewise/icons';
import { Menu as MenuBase } from '@base-ui/react/menu';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { FileIcon } from '@ui/components/file-icon';
import { IdeLogo } from '@ui/components/ide-logo';
import {
  getIDEFileUrl,
  IDE_SELECTION_ITEMS,
  nativeFileManagerLabel,
} from '@shared/ide-url';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import { Streamdown } from '@ui/components/streamdown';
import {
  type EditorActions,
  useFileEditorController,
} from './use-file-editor-controller';

const MONACO_THEME_NAME = 'stagewise-file-preview';

type MonacoApi = typeof Monaco;
type MonacoEditorInstance = Monaco.editor.IStandaloneCodeEditor;

type FilePreviewTabContentProps = {
  tab: TabState;
};

type CachedPreview = {
  preview: FilePreviewResult | null;
  error: string | null;
};

/** Persists Monaco scroll position across tab switches. */
const scrollStateStore = new Map<
  string,
  { scrollTop: number; scrollLeft: number }
>();

/** Persists markdown preview/source mode across tab switches. */
const markdownModeStore = new Map<string, 'preview' | 'source'>();

/** Persists diff editor mode (inline/split) across tab switches. */
const diffModeStore = new Map<string, 'inline' | 'split'>();

type ImagePreviewBackground = SvgPreviewBackground;

type SvgPreviewBackground =
  | 'default'
  | 'light'
  | 'dark'
  | 'checkerboard'
  | 'custom';

type SvgCurrentColorMode = 'default' | 'custom';

function normalizeHexColor(value: string, fallback: string) {
  const hex = value.trim();
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('')}`;
  }
  return fallback;
}

type SourceLanguage =
  | 'plaintext'
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'css'
  | 'scss'
  | 'html'
  | 'markdown'
  | 'xml'
  | 'yaml'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'php'
  | 'ruby'
  | 'sql';

/** File extension representative of each language, for seti-icons lookup. */
const LANGUAGE_EXT: Record<SourceLanguage, string> = {
  plaintext: '.txt',
  typescript: '.ts',
  javascript: '.js',
  json: '.json',
  css: '.css',
  scss: '.scss',
  html: '.html',
  markdown: '.md',
  xml: '.svg',
  yaml: '.yml',
  python: '.py',
  go: '.go',
  rust: '.rs',
  java: '.java',
  php: '.php',
  ruby: '.rb',
  sql: '.sql',
};

function iconForLanguage(language: SourceLanguage): React.ReactNode {
  return <FileIcon filePath={`file${LANGUAGE_EXT[language]}`} />;
}

const SOURCE_LANGUAGE_ITEMS: Array<{
  value: SourceLanguage;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'plaintext',
    label: 'Plain text',
    icon: iconForLanguage('plaintext'),
  },
  {
    value: 'typescript',
    label: 'TypeScript',
    icon: iconForLanguage('typescript'),
  },
  {
    value: 'javascript',
    label: 'JavaScript',
    icon: iconForLanguage('javascript'),
  },
  { value: 'json', label: 'JSON', icon: iconForLanguage('json') },
  { value: 'css', label: 'CSS', icon: iconForLanguage('css') },
  { value: 'scss', label: 'SCSS', icon: iconForLanguage('scss') },
  { value: 'html', label: 'HTML', icon: iconForLanguage('html') },
  { value: 'markdown', label: 'Markdown', icon: iconForLanguage('markdown') },
  { value: 'xml', label: 'XML / SVG', icon: iconForLanguage('xml') },
  { value: 'yaml', label: 'YAML', icon: iconForLanguage('yaml') },
  { value: 'python', label: 'Python', icon: iconForLanguage('python') },
  { value: 'go', label: 'Go', icon: iconForLanguage('go') },
  { value: 'rust', label: 'Rust', icon: iconForLanguage('rust') },
  { value: 'java', label: 'Java', icon: iconForLanguage('java') },
  { value: 'php', label: 'PHP', icon: iconForLanguage('php') },
  { value: 'ruby', label: 'Ruby', icon: iconForLanguage('ruby') },
  { value: 'sql', label: 'SQL', icon: iconForLanguage('sql') },
];

const previewCache = new Map<string, CachedPreview>();
const previewRequests = new Map<string, Promise<FilePreviewResult | null>>();
const textDraftCache = new Map<string, string>();
// Unsaved modified-side edits for diff tabs, keyed by tab id (stable across
// unmount/remount within a session). Lets the editable diff editor restore a
// user's in-progress edits when its tab is hidden and shown again, mirroring
// the plain editor's `textDraftCache`.
const diffDraftCache = new Map<string, string>();
function getPreviewCacheKey(workspaceKey: string, relativePath: string) {
  return `${workspaceKey}:${relativePath}`;
}

function languageFromPath(path: string): SourceLanguage {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'mjs':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'scss':
    case 'sass':
      return 'scss';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
      return 'java';
    case 'php':
      return 'php';
    case 'rb':
      return 'ruby';
    case 'sql':
      return 'sql';
    default:
      return 'plaintext';
  }
}

function isMarkdownPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'mdx';
}

function toHexChannel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

function linearSrgbToSrgb(value: number): number {
  if (value <= 0.0031308) return 12.92 * value;
  return 1.055 * value ** (1 / 2.4) - 0.055;
}

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = linearSrgbToSrgb(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
  );
  const g = linearSrgbToSrgb(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  );
  const blue = linearSrgbToSrgb(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );

  return `#${toHexChannel(r * 255)}${toHexChannel(g * 255)}${toHexChannel(
    blue * 255,
  )}`;
}

function cssColorToHex(color: string, fallback = '#ffffff'): string {
  const normalized = color.trim();
  if (!normalized || normalized === 'none') return fallback;
  if (normalized.startsWith('#')) return normalized;

  const rgbMatch = normalized.match(
    /rgba?\(\s*([\d.]+%?)\s*(?:,|\s)\s*([\d.]+%?)\s*(?:,|\s)\s*([\d.]+%?)(?:\s*(?:,|\/)\s*([\d.]+%?))?\s*\)/,
  );
  if (rgbMatch) {
    const [, r = '255', g = '255', b = '255', alpha] = rgbMatch;
    const channel = (value: string) =>
      value.endsWith('%')
        ? (Number.parseFloat(value) / 100) * 255
        : Number(value);
    const alphaHex = alpha
      ? toHexChannel(
          (alpha.endsWith('%')
            ? Number.parseFloat(alpha) / 100
            : Number(alpha)) * 255,
        )
      : '';
    return `#${toHexChannel(channel(r))}${toHexChannel(channel(g))}${toHexChannel(
      channel(b),
    )}${alphaHex}`;
  }

  const oklchMatch = normalized.match(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)/,
  );
  if (oklchMatch) {
    const [, l = '1', c = '0', h = '0'] = oklchMatch;
    const lightness = l.endsWith('%') ? Number.parseFloat(l) / 100 : Number(l);
    return oklchToHex(lightness, Number(c), Number(h));
  }

  return fallback;
}

function resolveCssColor(cssVariable: string, fallback = '#ffffff'): string {
  const rootStyles = getComputedStyle(document.documentElement);
  const rawValue = rootStyles.getPropertyValue(cssVariable).trim();
  if (rawValue === 'none') return fallback;

  const probe = document.createElement('span');
  probe.style.color = `var(${cssVariable})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return cssColorToHex(color, fallback);
}

function configureMonacoTheme(monaco: MonacoApi) {
  configureMonacoTypeScript(monaco);
  const color = (name: string, fallback?: string) =>
    resolveCssColor(name, fallback);
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const foreground = color('--color-foreground');
  const mutedForeground = color('--color-muted-foreground');
  const background = color('--color-background');
  const surface = color('--color-surface-1');
  const border = color('--color-border');
  const keyword = color('--syntax-keyword', foreground);
  const keywordControl = color('--syntax-keyword-control', foreground);
  const string = color('--syntax-string', foreground);
  const number = color('--syntax-number', foreground);
  const type = color('--syntax-type', foreground);
  const property = color('--syntax-property', foreground);
  const functionColor = color('--syntax-function', foreground);
  const constant = color('--syntax-constant', foreground);
  const tag = color('--syntax-tag', foreground);
  const regexp = color('--syntax-regexp', foreground);
  const cssProperty = color('--syntax-css-property', foreground);
  const cssValue = color('--syntax-css-value', foreground);
  const jsonProperty = color('--syntax-json-property', foreground);

  monaco.editor.defineTheme(MONACO_THEME_NAME, {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: foreground.slice(1) },
      {
        token: 'comment',
        foreground: mutedForeground.slice(1),
        fontStyle: 'italic',
      },
      { token: 'keyword', foreground: keyword.slice(1) },
      { token: 'keyword.control', foreground: keywordControl.slice(1) },
      { token: 'string', foreground: string.slice(1) },
      { token: 'number', foreground: number.slice(1) },
      { token: 'regexp', foreground: regexp.slice(1) },
      { token: 'type', foreground: type.slice(1) },
      { token: 'type.identifier', foreground: type.slice(1) },
      { token: 'identifier', foreground: foreground.slice(1) },
      { token: 'function', foreground: functionColor.slice(1) },
      { token: 'variable', foreground: foreground.slice(1) },
      { token: 'variable.predefined', foreground: constant.slice(1) },
      { token: 'constant', foreground: constant.slice(1) },
      { token: 'delimiter', foreground: foreground.slice(1) },
      { token: 'tag', foreground: tag.slice(1) },
      {
        token: 'attribute.name',
        foreground: property.slice(1),
        fontStyle: 'italic',
      },
      { token: 'attribute.value', foreground: string.slice(1) },
      { token: 'property', foreground: property.slice(1) },
      { token: 'key', foreground: jsonProperty.slice(1) },
      { token: 'string.key.json', foreground: jsonProperty.slice(1) },
      { token: 'attribute.name.css', foreground: cssProperty.slice(1) },
      { token: 'attribute.value.css', foreground: cssValue.slice(1) },
    ],
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editorLineNumber.foreground': mutedForeground,
      'editorLineNumber.activeForeground': foreground,
      'editor.selectionBackground': `${color('--color-primary-solid')}55`,
      'editor.inactiveSelectionBackground': `${surface}99`,
      'editor.lineHighlightBackground': surface,
      'editorCursor.foreground': foreground,
      'editorWhitespace.foreground': border,
      'editorIndentGuide.background1': border,
      'editorIndentGuide.activeBackground1': mutedForeground,
      'scrollbarSlider.background': `${foreground}22`,
      'scrollbarSlider.hoverBackground': `${foreground}33`,
      'scrollbarSlider.activeBackground': `${foreground}44`,
    },
  });
}

// Re-apply the Monaco theme whenever the OS color scheme flips. The theme is
// derived from CSS variables that switch via `prefers-color-scheme`, but Monaco
// caches the resolved theme, so without this it stays stale until the editor
// remounts. Registered once globally; the `change` event only fires on an
// actual scheme change, so this adds no steady-state cost.
let monacoThemeSyncRegistered = false;
function registerMonacoThemeSync(monaco: MonacoApi) {
  if (monacoThemeSyncRegistered) return;
  monacoThemeSyncRegistered = true;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', () => {
    configureMonacoTheme(monaco);
    monaco.editor.setTheme(MONACO_THEME_NAME);
  });
}

// Monaco's built-in TypeScript worker runs an embedded language service that
// has no access to the project's tsconfig.json, node_modules, or path aliases.
// This causes spurious errors (red squigglies) on valid code. The real LSP
// runs on the backend (LspService); the frontend editor is a viewer, not an
// IDE, so we disable Monaco's inline diagnostics entirely.
let monacoTSDiagnosticsDisabled = false;
function configureMonacoTypeScript(monaco: MonacoApi) {
  if (monacoTSDiagnosticsDisabled) return;
  monacoTSDiagnosticsDisabled = true;
  const noValidation = { noSemanticValidation: true, noSyntaxValidation: true };
  // monaco.languages.typescript is deprecated at the type level in Monaco
  // 0.55 (the declarations are stubbed), but the runtime API still exists.
  // We use a cast because importing from 'monaco-editor' directly would
  // bundle it eagerly instead of loading it dynamically via the wrapper.
  const ts = monaco.languages.typescript as unknown as {
    typescriptDefaults: {
      setDiagnosticsOptions(opts: Record<string, boolean>): void;
    };
    javascriptDefaults: {
      setDiagnosticsOptions(opts: Record<string, boolean>): void;
    };
  };
  ts.typescriptDefaults.setDiagnosticsOptions(noValidation);
  ts.javascriptDefaults.setDiagnosticsOptions(noValidation);
}

// Shared Monaco editor options used by both TextEditorPreview and SvgPreview
// source mode. fontSize, lineHeight, and readOnly are applied per-instance.
const MONACO_SOURCE_FONT_FAMILY =
  "'Roboto Mono', Menlo, Monaco, stagewise-builtin-roboto-mono, 'Noto Sans Mono', ui-monospace, 'SF Mono', 'Segoe UI Mono', 'Ubuntu Mono', 'Noto Mono', 'Liberation Mono', 'Inter Mono', Consolas, monospace";

const MONACO_SHARED_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions =
  {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    automaticLayout: true,
    renderLineHighlight: 'line',
    scrollbar: {
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
    },
    fontFamily: MONACO_SOURCE_FONT_FAMILY,
  };

/** Register Ctrl+/Ctrl-/Ctrl+0 zoom commands on a Monaco editor instance. */
function registerMonacoZoomCommands(
  editor: MonacoEditorInstance,
  monaco: MonacoApi,
  markFocused: () => void,
  updateZoom: (next: number) => void,
  zoomPercentageRef: React.MutableRefObject<number>,
) {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
    markFocused();
    updateZoom(zoomPercentageRef.current + 10);
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
    markFocused();
    updateZoom(zoomPercentageRef.current - 10);
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
    markFocused();
    updateZoom(100);
  });
}

/** Track the Monaco editor cursor position for the status bar. */
function useSourceCursorPosition(editor: MonacoEditorInstance | null): {
  lineNumber: number;
  column: number;
} {
  const [cursorPosition, setCursorPosition] = useState({
    lineNumber: 1,
    column: 1,
  });

  useEffect(() => {
    if (!editor) return;
    const position = editor.getPosition();
    if (position) {
      setCursorPosition({
        lineNumber: position.lineNumber,
        column: position.column,
      });
    }
    const disposable = editor.onDidChangeCursorPosition((event) => {
      setCursorPosition({
        lineNumber: event.position.lineNumber,
        column: event.position.column,
      });
    });
    return () => disposable.dispose();
  }, [editor]);

  return cursorPosition;
}

function useEditorActions(
  tabId: string,
  editor: MonacoEditorInstance | null,
  preview: FilePreviewResult,
  text: string,
  setText: (value: string) => void,
): EditorActions {
  const saveFile = useKartonProcedure((p) => p.fileTree.saveFile);
  const getFilePreview = useKartonProcedure((p) => p.fileTree.getFilePreview);
  const readOnly = preview.readOnly ?? false;
  const cacheKey = getPreviewCacheKey(
    preview.workspaceKey,
    preview.relativePath,
  );

  // Track the editor + current draft text in refs so the controller's stable
  // callbacks always observe live values without being re-created.
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const textRef = useRef(text);
  textRef.current = text;

  const controller = useFileEditorController({
    tabId,
    workspaceKey: preview.workspaceKey,
    relativePath: preview.relativePath,
    readOnly,
    saveFile,
    initialText: preview.text ?? '',
    initialMtimeMs: preview.mtimeMs,
    getModel: () => editorRef.current?.getModel(),
    // Fall back to the draft text when the editor is unmounted (e.g. SVG /
    // markdown preview mode) so dirty detection keeps working.
    getValue: () => editorRef.current?.getValue() ?? textRef.current,
    reload: async () => {
      const result = await getFilePreview(
        preview.workspaceKey,
        preview.relativePath,
      );
      if (!result) return null;
      const diskText = result.text ?? '';
      const key = getPreviewCacheKey(result.workspaceKey, result.relativePath);
      previewCache.set(key, { preview: result, error: null });
      textDraftCache.set(key, diskText);
      setText(diskText);
      return { text: diskText, mtimeMs: result.mtimeMs };
    },
    unsavedTitle: preview.relativePath.split('/').pop() || preview.relativePath,
    onDiscard: () => {
      textDraftCache.delete(cacheKey);
    },
    onSaved: (result, nextText) => {
      if (!result) return;
      const key = getPreviewCacheKey(result.workspaceKey, result.relativePath);
      previewCache.set(key, { preview: result, error: null });
      textDraftCache.set(key, nextText);
    },
  });

  const { reconcileDisk, refreshState, notifyContentChanged } = controller;

  // React to fresh on-disk content arriving from the parent's revalidation
  // (driven by the file-tree watcher bumping the backing directory's
  // revision). With no local edits the new content is adopted live; with
  // unsaved edits a conflict is raised so the user is warned.
  useEffect(() => {
    if (readOnly) return;
    const outcome = reconcileDisk(preview.text ?? '', preview.mtimeMs);
    if (outcome === 'adopted') {
      textDraftCache.set(cacheKey, preview.text ?? '');
      setText(preview.text ?? '');
    }
  }, [
    preview.text,
    preview.mtimeMs,
    readOnly,
    cacheKey,
    setText,
    reconcileDisk,
  ]);

  // Keep dirty/undo/redo in sync with the text value regardless of editor
  // mount state. When the editor is unmounted (e.g. SVG preview mode),
  // onDidChangeModelContent doesn't fire, so we rely on this effect.
  useEffect(() => {
    refreshState();
  }, [text, refreshState]);

  useEffect(() => {
    if (!editor) return;
    refreshState();
    const contentDisposable = editor.onDidChangeModelContent(() => {
      notifyContentChanged();
    });
    const cursorDisposable = editor.onDidChangeCursorSelection(() => {
      window.setTimeout(refreshState, 0);
    });
    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
    };
  }, [editor, refreshState, notifyContentChanged]);

  return controller.actions;
}

function ToolbarTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: HotkeyActions;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          {shortcut && <HotkeyCombo action={shortcut} size="xs" />}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// Derive the on-disk absolute path from a preview's workspace key
// (`<prefix>:<absoluteWorkspacePath>`) and its workspace-relative path.
function getPreviewAbsolutePath(
  preview: FilePreviewResult,
): string | undefined {
  const colonIndex = preview.workspaceKey.indexOf(':');
  if (colonIndex < 0) return undefined;
  const workspacePath = preview.workspaceKey.slice(colonIndex + 1);
  if (!workspacePath) return undefined;
  return `${workspacePath}/${preview.relativePath}`;
}

function OpenExternalMenu({ absolutePath }: { absolutePath: string }) {
  const ides: OpenFilesInIde[] = [
    'cursor',
    'vscode',
    'zed',
    'kiro',
    'windsurf',
    'trae',
  ];

  const open = (ide: OpenFilesInIde) => {
    window.open(getIDEFileUrl(absolutePath, ide), '_blank');
  };

  return (
    <MenuBase.Root>
      <Tooltip>
        <TooltipTrigger>
          <MenuBase.Trigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Open externally"
              >
                <IconOpenExternalOutline18 className="size-4" />
              </Button>
            }
          />
        </TooltipTrigger>
        <TooltipContent>Open externally</TooltipContent>
      </Tooltip>
      <MenuBase.Portal>
        <MenuBase.Positioner className="z-50" sideOffset={4} align="end">
          <MenuBase.Popup
            className={cn(
              'flex min-w-44 origin-(--transform-origin) flex-col items-stretch gap-0.5',
              'rounded-lg border border-border-subtle bg-background p-1',
              'text-xs shadow-lg',
              'transition-[transform,scale,opacity] duration-150 ease-out',
              'data-ending-style:scale-90 data-starting-style:scale-90',
              'data-ending-style:opacity-0 data-starting-style:opacity-0',
            )}
          >
            {ides.map((ide) => (
              <MenuBase.Item
                key={ide}
                className={cn(
                  'flex w-full cursor-default flex-row items-center justify-start gap-2',
                  'rounded-md px-2 py-1 text-foreground text-xs outline-none',
                  'transition-colors duration-150 ease-out',
                  'hover:bg-surface-1 data-highlighted:bg-surface-1',
                )}
                onClick={() => open(ide)}
              >
                <IdeLogo ide={ide} className="size-3.5 shrink-0" />
                <span>Open in {IDE_SELECTION_ITEMS[ide]}</span>
              </MenuBase.Item>
            ))}
            <MenuBase.Separator className="my-0.5 h-px bg-border-subtle" />
            <MenuBase.Item
              className={cn(
                'flex w-full cursor-default flex-row items-center justify-start gap-2',
                'rounded-md px-2 py-1 text-foreground text-xs outline-none',
                'transition-colors duration-150 ease-out',
                'hover:bg-surface-1 data-highlighted:bg-surface-1',
              )}
              onClick={() => open('other')}
            >
              <IdeLogo ide="other" className="size-3.5 shrink-0" />
              <span>Reveal in {IDE_SELECTION_ITEMS.other}</span>
            </MenuBase.Item>
          </MenuBase.Popup>
        </MenuBase.Positioner>
      </MenuBase.Portal>
    </MenuBase.Root>
  );
}

function FileTabToolbar({
  actions,
  right,
  openExternalPath,
  onInteract,
}: {
  actions: EditorActions | null;
  right?: React.ReactNode;
  openExternalPath?: string;
  onInteract?: () => void;
}) {
  // Read-only files (attachment blobs, bundled plugins, agent app scratch)
  // cannot be edited, so collapse the save/undo/redo controls to a single
  // read-only indicator.
  if (actions?.readOnly) {
    return (
      <div
        className="flex h-9 shrink-0 items-center justify-between border-border-subtle border-b bg-background px-1"
        onClickCapture={onInteract}
        onFocusCapture={onInteract}
      >
        <div className="flex items-center gap-1.5 px-2 text-muted-foreground text-xs">
          <IconLockKeyOutline18 className="size-4" />
          <span>Read-only</span>
        </div>
        <div className="flex items-center">
          {openExternalPath && (
            <div className="flex items-center px-1">
              <OpenExternalMenu absolutePath={openExternalPath} />
            </div>
          )}
          {right ? (
            <div className="flex items-center gap-1">{right}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between border-border-subtle border-b bg-background px-1"
      onClickCapture={onInteract}
      onFocusCapture={onInteract}
    >
      <div className="flex items-center">
        <div className="flex items-center px-1">
          <ToolbarTooltip label="Save file" shortcut={HotkeyActions.SAVE_FILE}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Save file"
              disabled={
                !actions?.isDirty || actions.isSaving || actions.externalChange
              }
              onClick={() => actions?.save()}
            >
              {actions?.isSaving ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <IconFloppyDiskOutline18 className="size-4" />
              )}
            </Button>
          </ToolbarTooltip>
        </div>
        <div className="h-5 w-px bg-border-subtle" />
        <div className="flex items-center px-1">
          <ToolbarTooltip label="Undo" shortcut={HotkeyActions.UNDO_FILE_EDIT}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Undo"
              disabled={!actions?.canUndo}
              onClick={() => actions?.undo()}
            >
              <IconUndoOutline18 className="size-4" />
            </Button>
          </ToolbarTooltip>
          <ToolbarTooltip label="Redo" shortcut={HotkeyActions.REDO_FILE_EDIT}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Redo"
              disabled={!actions?.canRedo}
              onClick={() => actions?.redo()}
            >
              <IconRedoOutline18 className="size-4" />
            </Button>
          </ToolbarTooltip>
        </div>
        {openExternalPath && (
          <>
            <div className="h-5 w-px bg-border-subtle" />
            <div className="flex items-center px-1">
              <OpenExternalMenu absolutePath={openExternalPath} />
            </div>
          </>
        )}
      </div>
      {right ? <div className="flex items-center gap-1">{right}</div> : null}
    </div>
  );
}

/**
 * Warning shown when a file was modified on disk while the user has unsaved
 * local edits. Saving is blocked until the user reloads (discarding local
 * edits) or explicitly overwrites the external changes.
 */
function ExternalChangeBanner({ actions }: { actions: EditorActions }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-border border-b bg-warning-solid/10 px-3 py-1.5 text-warning-foreground text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <span className="truncate">
          This file changed on disk since you started editing.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => actions.reload()}
          disabled={actions.isSaving}
        >
          Reload
        </Button>
        <Button
          variant="warning"
          size="xs"
          onClick={() => actions.forceSave()}
          disabled={actions.isSaving}
        >
          Overwrite
        </Button>
      </div>
    </div>
  );
}

/**
 * Banner shown when a file was moved (via drag-and-drop or cut-paste) while
 * open in a tab. The tab path was automatically updated; future edits go to
 * the new location. Dismissible.
 */
function FileMoveBanner({
  fromPath,
  toPath,
  onDismiss,
}: {
  fromPath: string;
  toPath: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-border border-b bg-info-solid/10 px-3 py-1.5 text-info-foreground text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <span className="truncate">
          File moved from {fromPath} to {toPath}. Future edits will apply to the
          new location.
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-2xs"
        className="shrink-0"
        onClick={onDismiss}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

/**
 * Banner shown when a file open in a tab was deleted. The user can close the
 * tab or re-create the file with the current editor content.
 */
function FileDeletedBanner({
  onClose,
  onRecreate,
  isRecreating,
}: {
  onClose: () => void;
  onRecreate: () => void;
  isRecreating: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-border border-b bg-error-solid/10 px-3 py-1.5 text-error-foreground text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <span className="truncate">
          This file was deleted outside of stagewise.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={onRecreate}
          disabled={isRecreating}
        >
          {isRecreating ? 'Recreating…' : 'Re-create and save'}
        </Button>
        <Button
          variant="destructive"
          size="xs"
          onClick={onClose}
          disabled={isRecreating}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

function useFileCodeZoom(tabId: string, enabled = true) {
  const storedZoomPercentage = useKartonState(
    (s) => s.preferences.general.fileCodeZoomPercentage,
  );
  const zoomPercentage = storedZoomPercentage ?? 100;
  const zoomPercentageRef = useRef(zoomPercentage);
  zoomPercentageRef.current = zoomPercentage;
  const { tabUiState, setTabUiState } = useTabUIState();
  const isTabContentFocused = tabUiState[tabId]?.focusedPanel === 'tab-content';

  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const updateZoom = useCallback(
    (nextZoomPercentage: number) => {
      const next = Math.max(50, Math.min(200, nextZoomPercentage));
      void updatePreferences([
        {
          op: storedZoomPercentage === undefined ? 'add' : 'replace',
          path: ['general', 'fileCodeZoomPercentage'],
          value: next,
        },
      ]);
    },
    [storedZoomPercentage, updatePreferences],
  );

  const zoomIn = useCallback(() => {
    if (!isTabContentFocused) return false;
    updateZoom(zoomPercentage + 10);
  }, [isTabContentFocused, updateZoom, zoomPercentage]);

  const zoomOut = useCallback(() => {
    if (!isTabContentFocused) return false;
    updateZoom(zoomPercentage - 10);
  }, [isTabContentFocused, updateZoom, zoomPercentage]);

  const zoomReset = useCallback(() => {
    if (!isTabContentFocused) return false;
    updateZoom(100);
  }, [isTabContentFocused, updateZoom]);

  const markFocused = useCallback(() => {
    setTabUiState(tabId, { focusedPanel: 'tab-content' });
  }, [setTabUiState, tabId]);

  useHotKeyListener(zoomIn, HotkeyActions.ZOOM_IN, enabled);
  useHotKeyListener(zoomOut, HotkeyActions.ZOOM_OUT, enabled);
  useHotKeyListener(zoomReset, HotkeyActions.ZOOM_RESET, enabled);

  return {
    fontSize: (12 * zoomPercentage) / 100,
    markFocused,
    updateZoom,
    zoomPercentage,
    zoomPercentageRef,
  };
}

type DiffMode = 'inline' | 'split';

function DiffEditorPreview({
  tab,
  tabId,
}: {
  tab: NonNullable<TabState['file']>;
  tabId: string;
}) {
  const getFileDiffContent = useKartonProcedure(
    (p) => p.toolbox.getFileDiffContent,
  );
  // Karton procedure identities are not guaranteed stable across renders;
  // keep this one in a ref so the load effect/reload don't re-run every render.
  const getFileDiffContentRef = useRef(getFileDiffContent);
  getFileDiffContentRef.current = getFileDiffContent;
  const saveFile = useKartonProcedure((p) => p.fileTree.saveFile);
  const getFileStat = useKartonProcedure((p) => p.fileTree.getFileStat);
  const [diffMode, setDiffMode] = useState<DiffMode>(() => {
    const stored = diffModeStore.get(tabId);
    return stored === 'inline' || stored === 'split' ? stored : 'inline';
  });
  const [diffContent, setDiffContent] = useState<FileDiffContent | null>(null);
  // The value rendered into the editable (modified/right) pane. Held separately
  // from `diffContent.modified` (the on-disk baseline) so it can be seeded from
  // `diffDraftCache` on mount and only reset on an explicit reload/adopt — never
  // mid-edit — which would otherwise clobber the model's content + undo stack.
  const [modifiedValue, setModifiedValue] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const language = languageFromPath(tab.relativePath);
  const { fontSize, markFocused } = useFileCodeZoom(tabId);
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(
    null,
  );

  // The diff always renders the committed (HEAD) version against the current
  // working-tree file, so the modified/right side is the live file on disk
  // and is editable unless the tab is explicitly read-only. Staged diffs are
  // the exception: they render the index snapshot (mtimeMs: null) with no
  // editable on-disk backing, so saving could overwrite unrelated unstaged
  // edits in the working tree — keep them read-only.
  const editable = !(tab.readOnly ?? false) && !(tab.diffStaged ?? false);

  // Last on-disk mtime we have reconciled to. Lets the live-detection effect
  // skip a git-diff fetch when an unrelated change bumps the directory
  // revision, and avoids treating our own writes as external edits.
  const diskMtimeRef = useRef<number | null>(null);

  // In-progress modified-side edits are cached by file identity — workspace +
  // path + staged flag — not by tab id. A tab id can be reused for a different
  // file or diff mode, and keying drafts by it would restore the wrong content
  // into the editable pane. A ref keeps the key current for the mount-time
  // content listener without forcing it to re-register on every render.
  const diffDraftKey = `${tab.workspaceKey}:${tab.relativePath}:${
    tab.diffStaged ? 'staged' : 'working'
  }`;
  const diffDraftKeyRef = useRef(diffDraftKey);
  diffDraftKeyRef.current = diffDraftKey;

  const persistMode = useCallback(
    (next: DiffMode) => {
      diffModeStore.set(tabId, next);
      setDiffMode(next);
    },
    [tabId],
  );

  // Extract the workspace path from the workspace key for the git diff
  // procedure (it expects a filesystem path, not a composite key).
  const workspacePath = useMemo(() => {
    const colonIdx = tab.workspaceKey.indexOf(':');
    return colonIdx < 0
      ? tab.workspaceKey
      : tab.workspaceKey.slice(colonIdx + 1);
  }, [tab.workspaceKey]);

  // All save / dirty / undo-redo / conflict / unsaved-prompt / hotkey behavior
  // is shared with the plain source editor via this controller. The diff
  // editor only supplies the editable (modified) model + a diff-aware reload.
  const controller = useFileEditorController({
    tabId,
    workspaceKey: tab.workspaceKey,
    relativePath: tab.relativePath,
    readOnly: !editable,
    saveFile,
    getModel: () => diffEditorRef.current?.getModifiedEditor().getModel(),
    getValue: () => diffEditorRef.current?.getModifiedEditor().getValue(),
    reload: async () => {
      setIsLoading(true);
      setDiffError(null);
      try {
        const content = await getFileDiffContentRef.current(
          workspacePath,
          tab.relativePath,
          tab.diffStaged ?? false,
          tab.diffOldPath,
        );
        setDiffContent(content);
        diskMtimeRef.current = content?.mtimeMs ?? null;
        if (!content) {
          setDiffError('Unable to load diff content.');
          return null;
        }
        // Explicit reload discards any in-progress draft and loads the fresh
        // on-disk content into the modified pane.
        diffDraftCache.delete(diffDraftKeyRef.current);
        setModifiedValue(content.modified);
        return { text: content.modified, mtimeMs: content.mtimeMs };
      } catch (err) {
        setDiffError(
          err instanceof Error ? err.message : 'Failed to load diff',
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    unsavedTitle: tab.relativePath.split('/').pop() || tab.relativePath,
    onSaved: (result) => {
      diskMtimeRef.current = result?.mtimeMs ?? null;
      // Saved content now matches disk; drop the draft so a later remount
      // reloads the clean on-disk version.
      diffDraftCache.delete(diffDraftKeyRef.current);
    },
    onDiscard: () => {
      diffDraftCache.delete(diffDraftKeyRef.current);
    },
    onSaveError: (err) => {
      setDiffError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  const { actions, reconcileDisk, refreshState, notifyContentChanged } =
    controller;

  // The @monaco-editor/react DiffEditor frequently mounts before its flex
  // container has a measured width, collapsing both panes to zero width
  // (only the right-edge overview ruler + scrollbar stay visible). Its
  // built-in automaticLayout does not reliably recover, so we force a
  // layout on mount and observe the container for size changes.
  const handleDiffMount = useCallback(
    (editor: Monaco.editor.IStandaloneDiffEditor, monaco: MonacoApi) => {
      diffEditorRef.current = editor;
      // Keep diff tabs on the live OS color scheme, matching the plain editor
      // mount; otherwise a theme flip leaves the diff on a stale Monaco theme.
      registerMonacoThemeSync(monaco);
      const container = editor.getContainerDomNode();
      const relayout = () => editor.layout();
      // Force an initial layout once the browser has painted the container.
      requestAnimationFrame(relayout);
      setTimeout(relayout, 0);
      setTimeout(relayout, 100);
      const target = container?.parentElement ?? container;
      if (target && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => editor.layout());
        observer.observe(target);
        editor.onDidDispose(() => observer.disconnect());
      }

      // Wire dirty tracking on the modified (right) editor. Save/undo/redo
      // hotkeys are handled globally by the controller.
      const modified = editor.getModifiedEditor();
      modified.onDidFocusEditorWidget(markFocused);
      modified.onDidChangeModelContent(() => {
        // Persist the in-progress edit so it survives an unmount/remount of
        // this tab (mirrors the plain editor's `textDraftCache`).
        diffDraftCache.set(diffDraftKeyRef.current, modified.getValue());
        notifyContentChanged();
      });
      refreshState();
    },
    [markFocused, notifyContentChanged, refreshState],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDiffError(null);

    // Safety timeout — surface an error if the backend doesn't respond
    // within a reasonable window instead of spinning forever.
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setDiffError('Diff load timed out.');
        setIsLoading(false);
      }
    }, 15_000);

    getFileDiffContentRef
      .current(
        workspacePath,
        tab.relativePath,
        tab.diffStaged ?? false,
        tab.diffOldPath,
      )
      .then((content) => {
        if (cancelled) return;
        // A success that lands after the safety timeout already fired must
        // clear the stale timeout error, otherwise the error pane stays up
        // despite valid content now being available.
        setDiffError(null);
        setDiffContent(content);
        diskMtimeRef.current = content?.mtimeMs ?? null;
        controller.setBaseline(
          content?.modified ?? '',
          content?.mtimeMs ?? null,
        );
        // Seed the modified pane from any cached draft (in-progress edits from
        // a prior mount of this tab) falling back to the on-disk content. The
        // baseline stays the on-disk content above, so a restored draft is
        // correctly reported as dirty.
        setModifiedValue(
          diffDraftCache.get(diffDraftKeyRef.current) ??
            content?.modified ??
            '',
        );
        if (!content) setDiffError('Unable to load diff content.');
      })
      .catch((err) => {
        if (cancelled) return;
        setDiffError(
          err instanceof Error ? err.message : 'Failed to load diff',
        );
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, tab.relativePath, tab.diffStaged, tab.diffOldPath]);

  // Live external-change detection. The file-tree watcher bumps the backing
  // directory's revision whenever its contents change on disk; on each bump we
  // cheaply stat the file and, if it actually changed, re-fetch the diff and
  // reconcile (adopt the new content when clean, raise a conflict otherwise).
  const directoryRevision = useKartonState((s) => {
    const slash = tab.relativePath.lastIndexOf('/');
    const directoryPath = slash === -1 ? '' : tab.relativePath.slice(0, slash);
    return (
      s.fileTree.directoryRevisions?.[tab.workspaceKey]?.[directoryPath] ??
      s.fileTree.workspaceRevisions?.[tab.workspaceKey] ??
      0
    );
  });
  const prevRevisionRef = useRef(directoryRevision);

  useEffect(() => {
    // Skip the initial run — the load effect owns the first fetch/baseline.
    if (prevRevisionRef.current === directoryRevision) return;
    prevRevisionRef.current = directoryRevision;
    if (!editable) return;

    let cancelled = false;
    void (async () => {
      let stat: Awaited<ReturnType<typeof getFileStat>> = null;
      try {
        stat = await getFileStat(tab.workspaceKey, tab.relativePath);
      } catch {
        return; // Transient failure — keep showing the current diff.
      }
      if (cancelled || !stat) return;
      if (stat.mtimeMs === diskMtimeRef.current) return; // Unchanged on disk.

      let content: FileDiffContent | null;
      try {
        content = await getFileDiffContentRef.current(
          workspacePath,
          tab.relativePath,
          tab.diffStaged ?? false,
          tab.diffOldPath,
        );
      } catch {
        return;
      }
      if (cancelled || !content) return;
      diskMtimeRef.current = content.mtimeMs ?? stat.mtimeMs;
      const outcome = reconcileDisk(content.modified, content.mtimeMs);
      // 'adopted' means the user had no local edits, so the fresh on-disk
      // content can replace both the baseline and the visible modified pane.
      if (outcome === 'adopted') {
        setDiffContent(content);
        diffDraftCache.delete(diffDraftKeyRef.current);
        setModifiedValue(content.modified);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    directoryRevision,
    editable,
    getFileStat,
    workspacePath,
    tab.workspaceKey,
    tab.relativePath,
    tab.diffStaged,
    tab.diffOldPath,
    reconcileDisk,
  ]);

  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={actions}
        openExternalPath={getPreviewAbsolutePath({
          workspaceKey: tab.workspaceKey,
          relativePath: tab.relativePath,
        } as FilePreviewResult)}
        onInteract={markFocused}
        right={
          <div className="flex h-7 items-center gap-1 rounded-md bg-surface-1 p-0.5">
            <button
              type="button"
              className={cn(
                'flex h-full cursor-pointer items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                diffMode === 'inline' &&
                  'bg-background text-foreground ring-1 ring-border-subtle',
              )}
              aria-label="Inline diff"
              aria-pressed={diffMode === 'inline'}
              onClick={() => persistMode('inline')}
            >
              <IconTextAlignLeft2Outline18 className="size-3.5" />
              {diffMode === 'inline' ? <span>Inline</span> : null}
            </button>
            <button
              type="button"
              className={cn(
                'flex h-full cursor-pointer items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                diffMode === 'split' &&
                  'bg-background text-foreground ring-1 ring-border-subtle',
              )}
              aria-label="Split diff"
              aria-pressed={diffMode === 'split'}
              onClick={() => persistMode('split')}
            >
              <IconSplitViewOutline18 className="size-3.5" />
              {diffMode === 'split' ? <span>Split</span> : null}
            </button>
          </div>
        }
      />
      {actions.externalChange ? (
        <ExternalChangeBanner actions={actions} />
      ) : null}
      <div
        className="min-h-0 flex-1"
        onFocusCapture={markFocused}
        onPointerDownCapture={markFocused}
      >
        {isLoading ? (
          <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
            <div className="flex items-center gap-2">
              <Loader2Icon className="size-3.5 animate-spin" />
              <span>Loading diff…</span>
            </div>
          </div>
        ) : diffError || !diffContent ? (
          <div className="flex size-full items-center justify-center text-error-foreground text-sm">
            {diffError ?? 'Unable to load diff'}
          </div>
        ) : (
          <DiffEditor
            height="100%"
            width="100%"
            language={language === 'plaintext' ? undefined : language}
            original={diffContent.original}
            modified={modifiedValue ?? diffContent.modified}
            theme={MONACO_THEME_NAME}
            beforeMount={configureMonacoTheme}
            onMount={handleDiffMount}
            options={{
              ...MONACO_SHARED_OPTIONS,
              renderSideBySide: diffMode === 'split',
              // Monaco otherwise auto-collapses side-by-side to inline
              // whenever the editor is narrower than
              // renderSideBySideInlineBreakpoint (900px). The file panel is
              // usually narrower than that, so force the chosen mode.
              useInlineViewWhenSpaceIsLimited: false,
              readOnly: !editable,
              originalEditable: false,
              renderIndicators: true,
              // Disable word wrap in both panes; lines scroll horizontally
              // instead. The diff editor's own wrap control defaults to
              // 'inherit', which Monaco applies inconsistently across panes,
              // so set it explicitly to keep both sides identical.
              diffWordWrap: 'off',
              // Monaco reserves a left margin in the modified editor for the
              // revert-change arrow icons. In split mode that margin shows up
              // as empty space between the two panes; in inline mode it pads
              // the left of the gutter. Disable it to reclaim that space.
              renderMarginRevertIcon: false,
              // Trim the remaining gutter chrome: drop the glyph margin and
              // code folding controls. lineNumbersMinChars keeps the (right-
              // aligned) number column from reserving extra blank space to
              // the left of the digits, while lineDecorationsWidth restores a
              // readable gap between the numbers and the code.
              glyphMargin: false,
              lineNumbersMinChars: 2,
              lineDecorationsWidth: 10,
              folding: false,
              enableSplitViewResizing: diffMode === 'split',
              // The diff editor renders both its own vertical scrollbar and a
              // wider diff overview ruler (the colored add/remove map). That
              // looks like two stacked scrollbars. Hide the plain scrollbar
              // and keep the highlighted overview ruler as the sole scroll
              // affordance (it supports click/drag-to-scroll).
              scrollbar: {
                ...MONACO_SHARED_OPTIONS.scrollbar,
                vertical: 'hidden',
                verticalScrollbarSize: 0,
              },
              // Apply the shared file-code zoom level. IDiffEditorOptions
              // extends the base editor options, so this propagates to both
              // the original and modified panes. The @monaco-editor/react
              // DiffEditor re-applies options on change, so updating the zoom
              // store re-renders this component and rescales the diff.
              fontSize,
              lineHeight: fontSize * 1.5,
            }}
          />
        )}
      </div>
    </div>
  );
}

function TextEditorPreview({
  preview,
  tabId,
}: {
  preview: FilePreviewResult;
  tabId: string;
}) {
  const cacheKey = getPreviewCacheKey(
    preview.workspaceKey,
    preview.relativePath,
  );
  const [text, setText] = useState(
    () => textDraftCache.get(cacheKey) ?? preview.text ?? '',
  );
  const { fontSize, markFocused, updateZoom, zoomPercentageRef } =
    useFileCodeZoom(tabId);
  const [language, setLanguage] = useState<SourceLanguage>(() =>
    languageFromPath(preview.relativePath),
  );
  const [editor, setEditor] = useState<MonacoEditorInstance | null>(null);
  const cursorPosition = useSourceCursorPosition(editor);
  const actions = useEditorActions(tabId, editor, preview, text, setText);

  const handleMount = useCallback(
    (editor: MonacoEditorInstance, monaco: MonacoApi) => {
      setEditor(editor);
      registerMonacoThemeSync(monaco);
      editor.onDidFocusEditorWidget(markFocused);
      registerMonacoZoomCommands(
        editor,
        monaco,
        markFocused,
        updateZoom,
        zoomPercentageRef,
      );
      // Save scroll position on every scroll so it survives tab switches
      // even if the editor is disposed before the unmount cleanup runs.
      editor.onDidScrollChange((e) => {
        scrollStateStore.set(cacheKey, {
          scrollTop: e.scrollTop,
          scrollLeft: e.scrollLeft,
        });
      });
      // Restore the last-known scroll position for this file.
      // Set immediately so the position is correct even if no layout
      // event fires after mount.  Monaco produces multiple layout
      // events during initialisation (content layout, then font-size /
      // option sync from the React wrapper) — each one resets the
      // scroll, so keep re-restoring on every layout event for a
      // settling window.
      const saved = scrollStateStore.get(cacheKey);
      if (saved) {
        editor.setScrollPosition(saved);
        const layoutDisposable = editor.onDidLayoutChange(() => {
          editor.setScrollPosition(saved);
        });
        setTimeout(() => layoutDisposable.dispose(), 300);
      }
    },
    [cacheKey, markFocused, updateZoom, zoomPercentageRef],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const nextText = value ?? '';
      textDraftCache.set(cacheKey, nextText);
      setText(nextText);
    },
    [cacheKey],
  );

  useEffect(() => {
    editor?.updateOptions({
      fontSize,
      lineHeight: fontSize * 1.5,
    });
  }, [editor, fontSize]);

  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={actions}
        openExternalPath={getPreviewAbsolutePath(preview)}
        onInteract={markFocused}
      />
      {actions.externalChange ? (
        <ExternalChangeBanner actions={actions} />
      ) : null}
      <div
        className="min-h-0 flex-1"
        onFocusCapture={markFocused}
        onPointerDownCapture={markFocused}
      >
        <MonacoEditor
          height="100%"
          language={language === 'plaintext' ? undefined : language}
          path={`${preview.workspaceKey}/${preview.relativePath}`}
          value={text}
          theme={MONACO_THEME_NAME}
          beforeMount={configureMonacoTheme}
          onMount={handleMount}
          onChange={handleChange}
          options={{
            ...MONACO_SHARED_OPTIONS,
            readOnly: preview.readOnly ?? false,
            fontSize,
            lineHeight: fontSize * 1.5,
          }}
        />
      </div>
      <FileEditorStatusBar
        lineNumber={cursorPosition.lineNumber}
        column={cursorPosition.column}
        language={language}
        onLanguageChange={setLanguage}
      />
    </div>
  );
}

function FileEditorStatusBar({
  lineNumber,
  column,
  language,
  onLanguageChange,
}: {
  lineNumber: number;
  column: number;
  language: SourceLanguage;
  onLanguageChange: (language: SourceLanguage) => void;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-border-subtle border-t bg-background pr-0.5 pl-2 text-muted-foreground text-xs">
      <span className="font-mono tabular-nums">
        Ln {lineNumber}, Col {column}
      </span>
      <SearchableSelect
        items={SOURCE_LANGUAGE_ITEMS}
        value={language}
        onValueChange={(value) => onLanguageChange(value as SourceLanguage)}
        size="xs"
        triggerVariant="ghost"
        triggerClassName="h-5 rounded-none px-1.5"
        side="top"
      />
    </div>
  );
}

function getPreviewBackgroundClassName(background: SvgPreviewBackground) {
  return background === 'light'
    ? 'bg-base-50'
    : background === 'dark'
      ? 'bg-base-900'
      : 'bg-background';
}

function getCheckerboardStyle(background: SvgPreviewBackground) {
  return background === 'checkerboard'
    ? {
        backgroundColor: 'var(--color-background)',
        backgroundImage:
          'linear-gradient(45deg, var(--color-surface-1) 25%, transparent 25%), linear-gradient(-45deg, var(--color-surface-1) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-surface-1) 75%), linear-gradient(-45deg, transparent 75%, var(--color-surface-1) 75%)',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
        backgroundSize: '16px 16px',
      }
    : undefined;
}

function useImagePanAndZoom(tabId: string, enabled = true) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const { tabUiState, setTabUiState } = useTabUIState();
  const isTabContentFocused = tabUiState[tabId]?.focusedPanel === 'tab-content';
  const panStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 });

  const markFocused = useCallback(() => {
    setTabUiState(tabId, { focusedPanel: 'tab-content' });
  }, [setTabUiState, tabId]);

  const zoomBy = useCallback((delta: number) => {
    setZoom((value) => Math.max(0.01, value + delta));
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!isTabContentFocused) return false;
    zoomBy(0.25);
  }, [isTabContentFocused, zoomBy]);

  const handleZoomOut = useCallback(() => {
    if (!isTabContentFocused) return false;
    zoomBy(-0.25);
  }, [isTabContentFocused, zoomBy]);

  const handleZoomReset = useCallback(() => {
    if (!isTabContentFocused) return false;
    setZoom(1);
  }, [isTabContentFocused]);

  useHotKeyListener(handleZoomIn, HotkeyActions.ZOOM_IN, enabled);
  useHotKeyListener(handleZoomOut, HotkeyActions.ZOOM_OUT, enabled);
  useHotKeyListener(handleZoomReset, HotkeyActions.ZOOM_RESET, enabled);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0035);
    setZoom((value) => Math.max(0.01, value * factor));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      markFocused();
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
      panStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [markFocused, pan.x, pan.y],
  );

  const clearPanCapture = useCallback((event: React.PointerEvent) => {
    if (panStateRef.current.pointerId !== event.pointerId) return;
    panStateRef.current.pointerId = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const state = panStateRef.current;
    if (state.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      panStateRef.current.pointerId = null;
      return;
    }
    setPan({
      x: state.originX + event.clientX - state.startX,
      y: state.originY + event.clientY - state.startY,
    });
  }, []);

  return {
    zoom,
    pan,
    isPanned: pan.x !== 0 || pan.y !== 0,
    setZoom,
    setPan,
    zoomBy,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    clearPanCapture,
    markFocused,
  };
}

function ImagePreview({
  preview,
  blobUrl,
  tabId,
}: {
  preview: FilePreviewResult;
  blobUrl: string;
  tabId: string;
}) {
  const [background, setBackground] =
    useState<ImagePreviewBackground>('default');
  const [customBackground, setCustomBackground] = useState('ffffff');
  const {
    zoom,
    pan,
    isPanned,
    setZoom,
    setPan,
    zoomBy,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    clearPanCapture,
    markFocused,
  } = useImagePanAndZoom(tabId);
  const normalizedCustomBackground = normalizeHexColor(
    customBackground,
    '#ffffff',
  );
  const [imageError, setImageError] = useState(false);
  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={null}
        openExternalPath={getPreviewAbsolutePath(preview)}
        right={
          <>
            {isPanned ? (
              <div className="flex items-center px-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Center image"
                  onClick={() => setPan({ x: 0, y: 0 })}
                >
                  <IconArrowsToCenterOutline18 className="size-4" />
                </Button>
              </div>
            ) : null}
            <div className="flex items-center gap-0.5 px-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Zoom out"
                disabled={zoom <= 0.01}
                onClick={() => zoomBy(-0.25)}
              >
                <MinusIcon className="size-4" />
              </Button>
              <button
                type="button"
                className="min-w-10 text-center text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid focus-visible:ring-inset"
                onClick={() => setZoom(1)}
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Zoom in"
                onClick={() => zoomBy(0.25)}
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
            <div className="h-5 w-px bg-border-subtle" />
            <div className="flex items-center px-1">
              <Popover>
                <PopoverTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Image background config"
                  >
                    <IconColorPaletteOutline18 className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 gap-3 p-3">
                  <div className="font-medium text-foreground text-xs">
                    Colors
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      <IconTextBgColorOutline18 className="size-3" />
                      Background
                    </span>
                    <Select<ImagePreviewBackground>
                      items={[
                        { value: 'default', label: 'Default' },
                        { value: 'light', label: 'Light' },
                        { value: 'dark', label: 'Dark' },
                        { value: 'checkerboard', label: 'Checkerboard' },
                        { value: 'custom', label: 'Custom' },
                      ]}
                      value={background}
                      onValueChange={(value) => setBackground(value)}
                      size="sm"
                    />
                    {background === 'custom' ? (
                      <div className="flex items-center rounded-md border border-surface-2 bg-surface-1 px-2">
                        <span className="font-mono text-muted-foreground text-sm">
                          #
                        </span>
                        <Input
                          className="border-0 bg-transparent px-1 font-mono focus:border-transparent"
                          size="xs"
                          type="text"
                          maxLength={6}
                          value={customBackground}
                          onValueChange={(value) =>
                            setCustomBackground(
                              String(value)
                                .replace(/[^0-9a-f]/gi, '')
                                .slice(0, 6),
                            )
                          }
                          placeholder="ffffff"
                        />
                      </div>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </>
        }
      />
      <div
        className={`flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden p-4 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${getPreviewBackgroundClassName(background)}`}
        role="button"
        tabIndex={0}
        aria-label="Image preview canvas"
        data-image-preview-canvas="true"
        onFocus={markFocused}
        onClick={markFocused}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearPanCapture}
        onPointerCancel={clearPanCapture}
        onLostPointerCapture={clearPanCapture}
        style={
          background === 'custom'
            ? { backgroundColor: normalizedCustomBackground }
            : getCheckerboardStyle(background)
        }
      >
        {imageError ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <TriangleAlertIcon className="size-8" />
            <span className="text-sm">Unable to render this image.</span>
            <span className="text-xs">
              The file may be corrupt or in an unsupported format.
            </span>
          </div>
        ) : (
          <img
            src={blobUrl}
            alt={preview.relativePath}
            className="pointer-events-none max-h-none max-w-none object-contain"
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
            }}
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </div>
  );
}

function SvgPreview({
  preview,
  tabId,
}: {
  preview: FilePreviewResult;
  tabId: string;
}) {
  const cacheKey = getPreviewCacheKey(
    preview.workspaceKey,
    preview.relativePath,
  );
  const [mode, setMode] = useState<'preview' | 'source'>(
    () => markdownModeStore.get(cacheKey) ?? 'preview',
  );
  const [text, setText] = useState(
    () => textDraftCache.get(cacheKey) ?? preview.text ?? '',
  );
  const {
    fontSize: sourceFontSize,
    markFocused: markSourceFocused,
    updateZoom: updateSourceZoom,
    zoomPercentageRef: sourceZoomPercentageRef,
  } = useFileCodeZoom(tabId, mode === 'source');
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(() =>
    languageFromPath(preview.relativePath),
  );
  const [background, setBackground] = useState<SvgPreviewBackground>('default');
  const storedCustomBg = useKartonState(
    (s) => s.preferences.general.svgCustomBackground,
  );
  const storedCustomFg = useKartonState(
    (s) => s.preferences.general.svgCustomForeground,
  );
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const customBackground = storedCustomBg ?? 'ffffff';
  const customCurrentColor = storedCustomFg ?? '8b5cf6';
  const setCustomBackground = useCallback(
    (value: string) => {
      void updatePreferences([
        {
          op: storedCustomBg === undefined ? 'add' : 'replace',
          path: ['general', 'svgCustomBackground'],
          value,
        },
      ]);
    },
    [storedCustomBg, updatePreferences],
  );
  const setCustomCurrentColor = useCallback(
    (value: string) => {
      void updatePreferences([
        {
          op: storedCustomFg === undefined ? 'add' : 'replace',
          path: ['general', 'svgCustomForeground'],
          value,
        },
      ]);
    },
    [storedCustomFg, updatePreferences],
  );
  const [currentColorMode, setCurrentColorMode] =
    useState<SvgCurrentColorMode>('default');
  const [imageError, setImageError] = useState(false);
  const [editor, setEditor] = useState<MonacoEditorInstance | null>(null);
  const cursorPosition = useSourceCursorPosition(editor);
  const actions = useEditorActions(tabId, editor, preview, text, setText);
  const previewBackgroundClassName = getPreviewBackgroundClassName(background);
  const normalizedCustomBackground = normalizeHexColor(
    customBackground,
    '#ffffff',
  );
  const normalizedCustomCurrentColor = normalizeHexColor(
    customCurrentColor,
    '#8b5cf6',
  );
  // When loaded via <img>, the SVG lives in an isolated document context.
  // currentColor resolves to the color property of the SVG element itself — it
  // does NOT inherit from the parent HTML <img>. We inject a :root { color }
  // rule into the SVG source so currentColor resolves correctly.
  const dataUrl = useMemo(() => {
    // CSS variables (var(--color-…)) do not resolve inside an <img>-loaded
    // SVG's isolated document, so we resolve them to hex via the HTML DOM.
    const color =
      currentColorMode === 'custom'
        ? normalizedCustomCurrentColor
        : resolveCssColor(
            background === 'dark'
              ? '--color-base-50'
              : background === 'light'
                ? '--color-base-900'
                : '--color-foreground',
          );
    const injected = text.replace(
      /<svg([^>]*)>/,
      `<svg$1><style>:root{color:${color}}</style>`,
    );
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(injected)}`;
  }, [text, currentColorMode, normalizedCustomCurrentColor, background]);

  // Reset image error when the SVG data URL changes.
  useEffect(() => {
    setImageError(false);
  }, [dataUrl]);

  // Cmd/Ctrl+Shift+V toggles code/preview mode when the tab is focused.
  const { tabUiState } = useTabUIState();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const tabUiStateRef = useRef(tabUiState);
  tabUiStateRef.current = tabUiState;
  const persistMode = useCallback(
    (next: 'preview' | 'source') => {
      markdownModeStore.set(cacheKey, next);
      setMode(next);
    },
    [cacheKey],
  );

  const toggleCodeMode = useCallback(() => {
    if (tabUiStateRef.current[tabId]?.focusedPanel !== 'tab-content')
      return false;
    persistMode(modeRef.current === 'source' ? 'preview' : 'source');
  }, [tabId, persistMode]);
  useHotKeyListener(toggleCodeMode, HotkeyActions.TOGGLE_SVG_CODE_MODE);

  const handleMount = useCallback(
    (editor: MonacoEditorInstance, monaco: MonacoApi) => {
      setEditor(editor);
      registerMonacoThemeSync(monaco);
      editor.onDidFocusEditorWidget(markSourceFocused);
      registerMonacoZoomCommands(
        editor,
        monaco,
        markSourceFocused,
        updateSourceZoom,
        sourceZoomPercentageRef,
      );
    },
    [markSourceFocused, sourceZoomPercentageRef, updateSourceZoom],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const nextText = value ?? '';
      textDraftCache.set(cacheKey, nextText);
      setText(nextText);
    },
    [cacheKey],
  );

  useEffect(() => {
    editor?.updateOptions({
      fontSize: sourceFontSize,
      lineHeight: sourceFontSize * 1.5,
    });
  }, [editor, sourceFontSize]);

  const {
    zoom,
    pan,
    isPanned,
    setZoom,
    setPan,
    zoomBy,
    handleWheel: handlePreviewWheel,
    handlePointerDown,
    handlePointerMove,
    clearPanCapture,
    markFocused,
  } = useImagePanAndZoom(tabId, mode === 'preview');

  // Hotkeys scoped to this SVG tab when it has focus.
  const bgRef = useRef(background);
  bgRef.current = background;
  const fgRef = useRef(currentColorMode);
  fgRef.current = currentColorMode;

  const handleCenterImage = useCallback(() => {
    if (tabUiStateRef.current[tabId]?.focusedPanel !== 'tab-content')
      return false;
    if (modeRef.current !== 'preview') return false;
    setPan({ x: 0, y: 0 });
  }, [tabId, setPan]);
  useHotKeyListener(handleCenterImage, HotkeyActions.CENTER_IMAGE);

  const handleCycleBg = useCallback(() => {
    if (tabUiStateRef.current[tabId]?.focusedPanel !== 'tab-content')
      return false;
    const options: SvgPreviewBackground[] = [
      'default',
      'light',
      'dark',
      'checkerboard',
      'custom',
    ];
    const idx = options.indexOf(bgRef.current);
    setBackground(options[(idx + 1) % options.length]!);
  }, [tabId]);
  useHotKeyListener(handleCycleBg, HotkeyActions.CYCLE_SVG_BG);

  const handleCycleFg = useCallback(() => {
    if (tabUiStateRef.current[tabId]?.focusedPanel !== 'tab-content')
      return false;
    const options: SvgCurrentColorMode[] = ['default', 'custom'];
    const idx = options.indexOf(fgRef.current);
    setCurrentColorMode(options[(idx + 1) % options.length]!);
  }, [tabId]);
  useHotKeyListener(handleCycleFg, HotkeyActions.CYCLE_SVG_FG);

  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={actions}
        openExternalPath={getPreviewAbsolutePath(preview)}
        onInteract={markSourceFocused}
        right={
          <>
            {mode === 'preview' && isPanned ? (
              <div className="flex items-center pr-2 pl-1">
                <ToolbarTooltip
                  label="Center image"
                  shortcut={HotkeyActions.CENTER_IMAGE}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Center image"
                    onClick={() => setPan({ x: 0, y: 0 })}
                  >
                    <IconArrowsToCenterOutline18 className="size-4" />
                  </Button>
                </ToolbarTooltip>
              </div>
            ) : null}
            {mode === 'preview' ? (
              <div className="flex items-center gap-0.5 px-1">
                <ToolbarTooltip
                  label="Zoom out"
                  shortcut={HotkeyActions.ZOOM_OUT}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Zoom out"
                    disabled={zoom <= 0.01}
                    onClick={() => zoomBy(-0.25)}
                  >
                    <MinusIcon className="size-4" />
                  </Button>
                </ToolbarTooltip>
                <ToolbarTooltip
                  label="Reset zoom"
                  shortcut={HotkeyActions.ZOOM_RESET}
                >
                  <button
                    type="button"
                    className="min-w-10 cursor-pointer text-center text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid focus-visible:ring-inset"
                    onClick={() => setZoom(1)}
                    aria-label="Reset zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip
                  label="Zoom in"
                  shortcut={HotkeyActions.ZOOM_IN}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Zoom in"
                    onClick={() => zoomBy(0.25)}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </ToolbarTooltip>
              </div>
            ) : null}
            {mode === 'preview' ? (
              <>
                <div className="h-5 w-px bg-border-subtle" />
                <div className="flex items-center px-1">
                  <ToolbarTooltip label="Preview config">
                    <Popover>
                      <PopoverTrigger>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Preview config"
                        >
                          <IconColorPaletteOutline18 className="size-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 gap-3 p-3">
                        <div className="font-medium text-foreground text-xs">
                          Colors
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <span className="flex items-center justify-between gap-1 text-muted-foreground text-xs">
                              <span className="flex items-center gap-1">
                                <IconTextBgColorOutline18 className="size-3" />
                                Background
                              </span>
                              <HotkeyCombo
                                action={HotkeyActions.CYCLE_SVG_BG}
                                size="xs"
                              />
                            </span>
                            <Select<SvgPreviewBackground>
                              items={[
                                { value: 'default', label: 'Default' },
                                { value: 'light', label: 'Light' },
                                { value: 'dark', label: 'Dark' },
                                {
                                  value: 'checkerboard',
                                  label: 'Checkerboard',
                                },
                                { value: 'custom', label: 'Custom' },
                              ]}
                              value={background}
                              onValueChange={(value) => setBackground(value)}
                              size="sm"
                            />
                            {background === 'custom' ? (
                              <div className="flex items-center rounded-md border border-surface-2 bg-surface-1 px-2">
                                <span className="font-mono text-muted-foreground text-sm">
                                  #
                                </span>
                                <Input
                                  className="border-0 bg-transparent px-1 font-mono focus:border-transparent"
                                  size="xs"
                                  type="text"
                                  maxLength={6}
                                  value={customBackground}
                                  onValueChange={(value) =>
                                    setCustomBackground(
                                      String(value)
                                        .replace(/[^0-9a-f]/gi, '')
                                        .slice(0, 6),
                                    )
                                  }
                                  placeholder="ffffff"
                                />
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <span className="flex items-center justify-between gap-1 text-muted-foreground text-xs">
                              <span className="flex items-center gap-1">
                                <IconTextColorOutline18 className="size-3" />
                                Foreground
                              </span>
                              <HotkeyCombo
                                action={HotkeyActions.CYCLE_SVG_FG}
                                size="xs"
                              />
                            </span>
                            <Select<SvgCurrentColorMode>
                              items={[
                                { value: 'default', label: 'Default' },
                                { value: 'custom', label: 'Custom' },
                              ]}
                              value={currentColorMode}
                              onValueChange={(value) =>
                                setCurrentColorMode(value)
                              }
                              size="sm"
                            />
                            {currentColorMode === 'custom' ? (
                              <div className="flex items-center rounded-md border border-surface-2 bg-surface-1 px-2">
                                <span className="font-mono text-muted-foreground text-sm">
                                  #
                                </span>
                                <Input
                                  className="border-0 bg-transparent px-1 font-mono focus:border-transparent"
                                  size="xs"
                                  type="text"
                                  maxLength={6}
                                  value={customCurrentColor}
                                  onValueChange={(value) =>
                                    setCustomCurrentColor(
                                      String(value)
                                        .replace(/[^0-9a-f]/gi, '')
                                        .slice(0, 6),
                                    )
                                  }
                                  placeholder="8b5cf6"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </ToolbarTooltip>
                </div>
              </>
            ) : null}
            <div className="flex h-7 items-center gap-1 rounded-md bg-surface-1 p-0.5">
              <ToolbarTooltip
                label="Show SVG source"
                shortcut={HotkeyActions.TOGGLE_SVG_CODE_MODE}
              >
                <button
                  type="button"
                  className={cn(
                    'flex h-full cursor-pointer items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                    mode === 'source' &&
                      'bg-background text-foreground ring-1 ring-border-subtle',
                  )}
                  aria-label="Show SVG source"
                  aria-pressed={mode === 'source'}
                  onClick={() => persistMode('source')}
                >
                  <IconSquareCodeOutline18 className="size-3.5" />
                  {mode === 'source' ? <span>Code</span> : null}
                </button>
              </ToolbarTooltip>
              <ToolbarTooltip
                label="Show SVG preview"
                shortcut={HotkeyActions.TOGGLE_SVG_CODE_MODE}
              >
                <button
                  type="button"
                  className={cn(
                    'flex h-full cursor-pointer items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                    mode === 'preview' &&
                      'bg-background text-foreground ring-1 ring-border-subtle',
                  )}
                  aria-label="Show SVG preview"
                  aria-pressed={mode === 'preview'}
                  onClick={() => persistMode('preview')}
                >
                  <IconEye2Outline18 className="size-3.5" />
                  {mode === 'preview' ? <span>Preview</span> : null}
                </button>
              </ToolbarTooltip>
            </div>
          </>
        }
      />
      {actions.externalChange ? (
        <ExternalChangeBanner actions={actions} />
      ) : null}
      <div className="min-h-0 flex-1">
        {mode === 'preview' ? (
          <button
            type="button"
            className={`flex size-full touch-none select-none items-center justify-center overflow-hidden p-4 text-left focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${previewBackgroundClassName}`}
            aria-label="SVG preview canvas"
            data-image-preview-canvas="true"
            onFocus={markFocused}
            onClick={markFocused}
            onWheel={handlePreviewWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearPanCapture}
            onPointerCancel={clearPanCapture}
            onLostPointerCapture={clearPanCapture}
            style={
              background === 'custom'
                ? { backgroundColor: normalizedCustomBackground }
                : getCheckerboardStyle(background)
            }
          >
            {imageError ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <TriangleAlertIcon className="size-8" />
                <span className="text-sm">Unable to render this SVG.</span>
                <span className="text-xs">
                  The file may be malformed or contain unsupported content.
                </span>
              </div>
            ) : (
              <img
                src={dataUrl}
                alt={preview.relativePath}
                className="pointer-events-none max-h-none max-w-none object-contain"
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center',
                }}
                onError={() => setImageError(true)}
              />
            )}
          </button>
        ) : (
          <div
            className="size-full"
            onFocusCapture={markSourceFocused}
            onPointerDownCapture={markSourceFocused}
          >
            <MonacoEditor
              height="100%"
              language={
                sourceLanguage === 'plaintext' ? undefined : sourceLanguage
              }
              path={`${preview.workspaceKey}/${preview.relativePath}`}
              value={text}
              theme={MONACO_THEME_NAME}
              beforeMount={configureMonacoTheme}
              onMount={handleMount}
              onChange={handleChange}
              options={{
                ...MONACO_SHARED_OPTIONS,
                readOnly: preview.readOnly ?? false,
                fontSize: sourceFontSize,
                lineHeight: sourceFontSize * 1.5,
              }}
            />
          </div>
        )}
      </div>
      {mode === 'source' ? (
        <FileEditorStatusBar
          lineNumber={cursorPosition.lineNumber}
          column={cursorPosition.column}
          language={sourceLanguage}
          onLanguageChange={setSourceLanguage}
        />
      ) : null}
    </div>
  );
}

function MarkdownPreview({
  preview,
  tabId,
}: {
  preview: FilePreviewResult;
  tabId: string;
}) {
  const cacheKey = getPreviewCacheKey(
    preview.workspaceKey,
    preview.relativePath,
  );
  const [mode, setMode] = useState<'preview' | 'source'>(
    () => markdownModeStore.get(cacheKey) ?? 'preview',
  );
  const [text, setText] = useState(
    () => textDraftCache.get(cacheKey) ?? preview.text ?? '',
  );
  const { fontSize, markFocused, updateZoom, zoomPercentageRef } =
    useFileCodeZoom(tabId, mode === 'source');
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(() =>
    languageFromPath(preview.relativePath),
  );
  const [editor, setEditor] = useState<MonacoEditorInstance | null>(null);
  const cursorPosition = useSourceCursorPosition(editor);
  const actions = useEditorActions(tabId, editor, preview, text, setText);

  // Cmd/Ctrl+Shift+V toggles code/preview mode when the tab is focused.
  const { tabUiState } = useTabUIState();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const tabUiStateRef = useRef(tabUiState);
  tabUiStateRef.current = tabUiState;
  const persistMode = useCallback(
    (next: 'preview' | 'source') => {
      markdownModeStore.set(cacheKey, next);
      setMode(next);
    },
    [cacheKey],
  );

  const toggleCodeMode = useCallback(() => {
    if (tabUiStateRef.current[tabId]?.focusedPanel !== 'tab-content')
      return false;
    persistMode(modeRef.current === 'source' ? 'preview' : 'source');
  }, [tabId, persistMode]);
  useHotKeyListener(toggleCodeMode, HotkeyActions.TOGGLE_MARKDOWN_PREVIEW);

  const handleMount = useCallback(
    (editor: MonacoEditorInstance, monaco: MonacoApi) => {
      setEditor(editor);
      registerMonacoThemeSync(monaco);
      editor.onDidFocusEditorWidget(markFocused);
      registerMonacoZoomCommands(
        editor,
        monaco,
        markFocused,
        updateZoom,
        zoomPercentageRef,
      );
      editor.onDidScrollChange((e) => {
        scrollStateStore.set(cacheKey, {
          scrollTop: e.scrollTop,
          scrollLeft: e.scrollLeft,
        });
      });
      // Restore the last-known scroll position for this file.
      // Set immediately so the position is correct even if no layout
      // event fires after mount.  Monaco produces multiple layout
      // events during initialisation (content layout, then font-size /
      // option sync from the React wrapper) — each one resets the
      // scroll, so keep re-restoring on every layout event for a
      // settling window.
      const saved = scrollStateStore.get(cacheKey);
      if (saved) {
        editor.setScrollPosition(saved);
        const layoutDisposable = editor.onDidLayoutChange(() => {
          editor.setScrollPosition(saved);
        });
        setTimeout(() => layoutDisposable.dispose(), 300);
      }
    },
    [cacheKey, markFocused, updateZoom, zoomPercentageRef],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const nextText = value ?? '';
      textDraftCache.set(cacheKey, nextText);
      setText(nextText);
    },
    [cacheKey],
  );

  useEffect(() => {
    editor?.updateOptions({
      fontSize,
      lineHeight: fontSize * 1.5,
    });
  }, [editor, fontSize]);

  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={actions}
        openExternalPath={getPreviewAbsolutePath(preview)}
        onInteract={markFocused}
        right={
          <div className="flex h-7 items-center gap-1 rounded-md bg-surface-1 p-0.5">
            <ToolbarTooltip
              label="Show markdown source"
              shortcut={HotkeyActions.TOGGLE_MARKDOWN_PREVIEW}
            >
              <button
                type="button"
                className={cn(
                  'flex h-full cursor-pointer items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                  mode === 'source' &&
                    'bg-background text-foreground ring-1 ring-border-subtle',
                )}
                aria-label="Show markdown source"
                aria-pressed={mode === 'source'}
                onClick={() => persistMode('source')}
              >
                <IconSquareCodeOutline18 className="size-3.5" />
                {mode === 'source' ? <span>Code</span> : null}
              </button>
            </ToolbarTooltip>
            <ToolbarTooltip
              label="Show markdown preview"
              shortcut={HotkeyActions.TOGGLE_MARKDOWN_PREVIEW}
            >
              <button
                type="button"
                className={cn(
                  'flex h-full cursor-pointer items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                  mode === 'preview' &&
                    'bg-background text-foreground ring-1 ring-border-subtle',
                )}
                aria-label="Show markdown preview"
                aria-pressed={mode === 'preview'}
                onClick={() => persistMode('preview')}
              >
                <IconEye2Outline18 className="size-3.5" />
                {mode === 'preview' ? <span>Preview</span> : null}
              </button>
            </ToolbarTooltip>
          </div>
        }
      />
      {actions.externalChange ? (
        <ExternalChangeBanner actions={actions} />
      ) : null}
      <div className="min-h-0 flex-1">
        {mode === 'preview' ? (
          <div className="[&_[data-streamdown=image-wrapper]]:!items-start scrollbar-subtle size-full overflow-auto p-6 text-foreground [&_[data-streamdown=image-wrapper]>div:first-child]:hidden">
            <Streamdown isAnimating={false}>{text}</Streamdown>
          </div>
        ) : (
          <div
            className="size-full"
            onFocusCapture={markFocused}
            onPointerDownCapture={markFocused}
          >
            <MonacoEditor
              height="100%"
              language={
                sourceLanguage === 'plaintext' ? undefined : sourceLanguage
              }
              path={`${preview.workspaceKey}/${preview.relativePath}`}
              value={text}
              theme={MONACO_THEME_NAME}
              beforeMount={configureMonacoTheme}
              onMount={handleMount}
              onChange={handleChange}
              options={{
                ...MONACO_SHARED_OPTIONS,
                readOnly: preview.readOnly ?? false,
                fontSize,
                lineHeight: fontSize * 1.5,
              }}
            />
          </div>
        )}
      </div>
      {mode === 'source' ? (
        <FileEditorStatusBar
          lineNumber={cursorPosition.lineNumber}
          column={cursorPosition.column}
          language={sourceLanguage}
          onLanguageChange={setSourceLanguage}
        />
      ) : null}
    </div>
  );
}

function BinaryPreview({
  workspaceKey,
  relativePath,
  revealInFolder,
}: {
  workspaceKey: string;
  relativePath: string;
  revealInFolder: (workspaceKey: string, relativePath: string) => void;
}) {
  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar actions={null} />
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-muted-foreground">
          <span className="font-normal text-muted-foreground text-sm">
            Can't display this file inside stagewise
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => revealInFolder(workspaceKey, relativePath)}
          >
            Reveal in {nativeFileManagerLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// A file backing a tab may no longer exist on disk — e.g. the workspace was
// unmounted and the file was deleted externally, or an agent (and its
// attachment blobs) was removed. Detect that case so the tab can show a
// friendly "file removed" notice instead of a raw filesystem error string.
function isMissingFileError(error: string | null): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('enoent') ||
    normalized.includes('no such file') ||
    normalized.includes('not a file') ||
    normalized.includes('escapes workspace root')
  );
}

function MissingFileNotice() {
  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar actions={null} />
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-muted-foreground">
          <IconDatabaseFillDuo18 className="size-12" />
          <span className="font-medium text-foreground text-sm">
            This file is no longer available
          </span>
          <span className="text-xs">
            It may have been deleted, moved, or removed together with the agent
            it belonged to. The contents can no longer be loaded.
          </span>
        </div>
      </div>
    </div>
  );
}

export function FilePreviewTabContent({ tab }: FilePreviewTabContentProps) {
  const getFilePreview = useKartonProcedure((p) => p.fileTree.getFilePreview);
  const getFileStat = useKartonProcedure((p) => p.fileTree.getFileStat);
  const clearFileNotice = useKartonProcedure((p) => p.browser.clearFileNotice);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const recreateDeletedFile = useKartonProcedure(
    (p) => p.fileTree.recreateDeletedFile,
  );
  const revealInFolder = useKartonProcedure((p) => p.fileTree.revealInFolder);
  const [isRecreating, setIsRecreating] = useState(false);
  const workspaceKey = tab.file?.workspaceKey;
  const relativePath = tab.file?.relativePath;
  // Git diff tabs render via DiffEditorPreview, which loads its own content.
  // Skip the regular file-preview fetch/revalidate pipeline entirely so a
  // diff tab doesn't trigger redundant getFilePreview calls on every watcher
  // revision bump.
  const isDiffTab = tab.file?.showDiff ?? false;
  const cacheKey =
    workspaceKey && relativePath
      ? getPreviewCacheKey(workspaceKey, relativePath)
      : null;

  // Construct a direct file://-equivalent URL that the registered custom
  // protocols (workspace://, attachment://) can resolve without reading the
  // file into memory or base64-encoding it.
  const blobUrl = useMemo(() => {
    if (!workspaceKey || !relativePath) return '';
    if (workspaceKey.startsWith('att:')) {
      return tab.agentInstanceId
        ? `attachment://${tab.agentInstanceId}/${encodeURIComponent(relativePath)}`
        : '';
    }
    const colonIdx = workspaceKey.indexOf(':');
    if (colonIdx <= 0) return '';
    const mountPrefix = workspaceKey.slice(0, colonIdx);
    const workspaceRoot = workspaceKey.slice(colonIdx + 1);
    const params = new URLSearchParams({ root: workspaceRoot });
    return `workspace://${mountPrefix}/${encodeURIComponent(relativePath)}?${params}`;
  }, [workspaceKey, relativePath, tab.agentInstanceId]);

  // The file-tree watcher bumps the revision of the directory backing each
  // open file tab whenever its contents change on disk. Subscribing to that
  // single number lets us revalidate only the affected file in response to an
  // external edit, instead of polling every open tab.
  const directoryRevision = useKartonState((s) => {
    if (!workspaceKey || !relativePath) return 0;
    const slash = relativePath.lastIndexOf('/');
    const directoryPath = slash === -1 ? '' : relativePath.slice(0, slash);
    return (
      s.fileTree.directoryRevisions?.[workspaceKey]?.[directoryPath] ??
      s.fileTree.workspaceRevisions?.[workspaceKey] ??
      0
    );
  });

  const cached = cacheKey ? previewCache.get(cacheKey) : undefined;
  const [preview, setPreview] = useState<FilePreviewResult | null>(
    cached?.preview ?? null,
  );
  const [error, setError] = useState<string | null>(cached?.error ?? null);
  const [isLoading, setIsLoading] = useState(!cached);

  // Cheap revalidation: stat the file and only re-read its full contents when
  // the mtime/size actually changed. Used for both re-open staleness (run on
  // mount) and live external-edit detection (run on directory-revision bumps).
  // Read-only blobs (attachments) never change, so they are skipped entirely.
  const revalidate = useCallback(async () => {
    if (isDiffTab) return;
    if (!workspaceKey || !relativePath || !cacheKey) return;
    const current = previewCache.get(cacheKey);
    // Nothing loaded yet — the initial-load effect owns the first fetch.
    if (!current?.preview) return;
    if (current.preview.readOnly) return;

    let stat: FileStatResult | null = null;
    try {
      stat = await getFileStat(workspaceKey, relativePath);
    } catch {
      return; // Transient failure — keep showing the current content.
    }
    if (!stat) {
      const missing = 'ENOENT: file no longer exists';
      previewCache.set(cacheKey, { preview: null, error: missing });
      setPreview(null);
      setError(missing);
      return;
    }
    const latest = previewCache.get(cacheKey)?.preview;
    if (
      latest &&
      latest.mtimeMs === stat.mtimeMs &&
      latest.size === stat.size
    ) {
      return; // Unchanged on disk — nothing to do.
    }

    let result: FilePreviewResult | null;
    try {
      result = await getFilePreview(workspaceKey, relativePath);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load file';
      previewCache.set(cacheKey, { preview: null, error: message });
      setPreview(null);
      setError(message);
      return;
    }
    const nextError = result ? null : 'File preview unavailable';
    previewCache.set(cacheKey, { preview: result, error: nextError });
    setPreview(result);
    setError(nextError);
  }, [
    isDiffTab,
    workspaceKey,
    relativePath,
    cacheKey,
    getFileStat,
    getFilePreview,
  ]);

  useEffect(() => {
    if (isDiffTab) return;
    if (!workspaceKey || !relativePath || !cacheKey) return;
    const cachedPreview = previewCache.get(cacheKey);
    if (cachedPreview) {
      setPreview(cachedPreview.preview);
      setError(cachedPreview.error);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const request =
      previewRequests.get(cacheKey) ??
      getFilePreview(workspaceKey, relativePath).finally(() => {
        previewRequests.delete(cacheKey);
      });
    previewRequests.set(cacheKey, request);

    request
      .then((result) => {
        const nextError = result ? null : 'File preview unavailable';
        previewCache.set(cacheKey, {
          preview: result,
          error: nextError,
        });
        if (cancelled) return;
        setPreview(result);
        setError(nextError);
      })
      .catch((err) => {
        const nextError =
          err instanceof Error ? err.message : 'Failed to load file';
        previewCache.set(cacheKey, {
          preview: null,
          error: nextError,
        });
        if (cancelled) return;
        setPreview(null);
        setError(nextError);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDiffTab, workspaceKey, relativePath, cacheKey, getFilePreview]);

  // Revalidate when the tab (re)mounts and whenever the backing directory
  // changes on disk. On mount this ensures a re-opened tab shows the latest
  // content rather than a stale cached copy; on revision bumps it picks up
  // external edits in real time without polling.
  // Skip when the file has a delete notice — the file no longer exists and
  // we're preserving the cached content for re-create.
  useEffect(() => {
    if (tab.fileNotice?.kind === 'deleted') return;
    void revalidate();
  }, [revalidate, directoryRevision, tab.fileNotice]);

  if (!tab.file) {
    return (
      <div className="flex size-full items-center justify-center bg-background text-muted-foreground text-sm">
        Missing file metadata.
      </div>
    );
  }

  // Handlers for file-notice banners.
  const handleDismissMoveNotice = useCallback(() => {
    void clearFileNotice(tab.id);
  }, [clearFileNotice, tab.id]);

  const handleCloseDeletedTab = useCallback(() => {
    void clearFileNotice(tab.id);
    void closeTab(tab.id);
  }, [clearFileNotice, closeTab, tab.id]);

  const handleRecreateDeleted = useCallback(async () => {
    if (!workspaceKey || !relativePath) return;
    setIsRecreating(true);
    try {
      const content =
        textDraftCache.get(getPreviewCacheKey(workspaceKey, relativePath)) ??
        preview?.text ??
        '';
      await recreateDeletedFile(workspaceKey, relativePath, content);
      // Recreate succeeded — the notice is cleared by the backend.
      // Re-trigger loading to fetch the freshly-created file.
      setIsRecreating(false);
      void revalidate();
    } catch {
      setIsRecreating(false);
    }
  }, [workspaceKey, relativePath, preview, recreateDeletedFile, revalidate]);

  const fileNotice = tab.fileNotice;

  // File was deleted — keep showing cached content with the delete banner.
  // Don't show the MissingFileNotice; the user can still see/edit and
  // choose to re-create.
  if (fileNotice?.kind === 'deleted') {
    const cachedPreview = cacheKey
      ? (previewCache.get(cacheKey)?.preview ?? preview)
      : preview;
    return (
      <div className="absolute inset-0 z-10 flex flex-col bg-background">
        <FileDeletedBanner
          onClose={handleCloseDeletedTab}
          onRecreate={handleRecreateDeleted}
          isRecreating={isRecreating}
        />
        <div className="min-h-0 flex-1">
          {cachedPreview ? (
            cachedPreview.kind === 'image' ? (
              <ImagePreview
                preview={cachedPreview}
                blobUrl={blobUrl}
                tabId={tab.id}
              />
            ) : cachedPreview.kind === 'svg' ? (
              <SvgPreview preview={cachedPreview} tabId={tab.id} />
            ) : isMarkdownPath(cachedPreview.relativePath) ? (
              <MarkdownPreview preview={cachedPreview} tabId={tab.id} />
            ) : (
              <TextEditorPreview preview={cachedPreview} tabId={tab.id} />
            )
          ) : (
            <div className="flex size-full flex-col bg-background">
              <FileTabToolbar actions={null} />
              <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-xs">
                No cached content available.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Git diff view: bypass the regular file preview pipeline entirely.
  // The DiffEditorPreview loads its own content and is read-only.
  if (tab.file?.showDiff) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col bg-background">
        <DiffEditorPreview tab={tab.file} tabId={tab.id} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      {fileNotice?.kind === 'moved' && tab.file && (
        <FileMoveBanner
          fromPath={fileNotice.fromRelativePath}
          toPath={tab.file.relativePath}
          onDismiss={handleDismissMoveNotice}
        />
      )}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex size-full flex-col bg-background">
            <FileTabToolbar actions={null} />
            <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-xs">
              <div className="flex items-center gap-2">
                <Loader2Icon className="size-3.5 animate-spin" />
                <span>Loading file…</span>
              </div>
            </div>
          </div>
        ) : isMissingFileError(error) ? (
          <MissingFileNotice />
        ) : error || !preview ? (
          <div className="flex size-full flex-col bg-background">
            <FileTabToolbar actions={null} />
            <div className="flex min-h-0 flex-1 items-center justify-center text-error-foreground text-sm">
              {error ?? 'Failed to load file'}
            </div>
          </div>
        ) : preview.truncated ? (
          <div className="flex size-full flex-col">
            {preview.kind === 'text' || preview.kind === 'svg' ? (
              <>
                <div className="shrink-0 border-border border-b px-3 py-1 text-warning-foreground text-xs">
                  Preview truncated
                </div>
                <div className="min-h-0 flex-1">
                  <TextEditorPreview preview={preview} tabId={tab.id} />
                </div>
              </>
            ) : (
              <BinaryPreview
                workspaceKey={workspaceKey!}
                relativePath={relativePath!}
                revealInFolder={revealInFolder}
              />
            )}
          </div>
        ) : preview.kind === 'image' ? (
          <ImagePreview preview={preview} blobUrl={blobUrl} tabId={tab.id} />
        ) : preview.kind === 'svg' ? (
          <SvgPreview preview={preview} tabId={tab.id} />
        ) : preview.kind === 'text' && isMarkdownPath(preview.relativePath) ? (
          <MarkdownPreview preview={preview} tabId={tab.id} />
        ) : preview.kind === 'text' ? (
          <TextEditorPreview preview={preview} tabId={tab.id} />
        ) : (
          <BinaryPreview
            workspaceKey={workspaceKey!}
            relativePath={relativePath!}
            revealInFolder={revealInFolder}
          />
        )}
      </div>
    </div>
  );
}
