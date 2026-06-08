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
import type { FilePreviewResult, TabState } from '@shared/karton-contracts/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { IconDatabaseFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { Loader2Icon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  IconFloppyDiskOutline18,
  IconArrowsToCenterOutline18,
  IconColorPaletteOutline18,
  IconEye2Outline18,
  IconRedoOutline18,
  IconSquareCodeOutline18,
  IconTextBgColorOutline18,
  IconTextColorOutline18,
  IconUndoOutline18,
} from 'nucleo-ui-outline-18';
import MonacoEditor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';

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

type EditorActions = {
  save: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isSaving: boolean;
};

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

const SOURCE_LANGUAGE_ITEMS: Array<{
  value: SourceLanguage;
  label: string;
}> = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'xml', label: 'XML / SVG' },
  { value: 'yaml', label: 'YAML' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'sql', label: 'SQL' },
];

const previewCache = new Map<string, CachedPreview>();
const previewRequests = new Map<string, Promise<FilePreviewResult | null>>();
const textDraftCache = new Map<string, string>();
function getPreviewCacheKey(workspaceKey: string, relativePath: string) {
  return `${workspaceKey}:${relativePath}`;
}

function languageFromPath(path: string): SourceLanguage {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
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

function createEditorActionState(editor: MonacoEditorInstance | null) {
  const model = editor?.getModel();
  if (!editor || !model) {
    return {
      canUndo: false,
      canRedo: false,
    };
  }

  const alternativeVersionId = model.getAlternativeVersionId();
  editor.trigger('file-preview-state', 'undo', undefined);
  const afterUndoVersionId = model.getAlternativeVersionId();
  const canUndo = afterUndoVersionId !== alternativeVersionId;
  if (canUndo) {
    editor.trigger('file-preview-state', 'redo', undefined);
  }

  editor.trigger('file-preview-state', 'redo', undefined);
  const afterRedoVersionId = model.getAlternativeVersionId();
  const canRedo = afterRedoVersionId !== alternativeVersionId;
  if (canRedo) {
    editor.trigger('file-preview-state', 'undo', undefined);
  }

  return {
    canUndo,
    canRedo,
  };
}

function useEditorActions(
  editorRef: RefObject<MonacoEditorInstance | null>,
  preview: FilePreviewResult,
  text: string,
) {
  const saveFile = useKartonProcedure((p) => p.fileTree.saveFile);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const savedTextRef = useRef(preview.text ?? '');

  const refreshActionState = useCallback(() => {
    const state = createEditorActionState(editorRef.current);
    setCanUndo(state.canUndo);
    setCanRedo(state.canRedo);
    setIsDirty(text !== savedTextRef.current);
  }, [editorRef, text]);

  useEffect(() => {
    savedTextRef.current = preview.text ?? '';
    setIsDirty(text !== savedTextRef.current);
    refreshActionState();
  }, [preview.relativePath, preview.text, refreshActionState, text]);

  const save = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || isSaving) return;

    const nextText = editor.getValue();
    setIsSaving(true);
    void saveFile(preview.workspaceKey, preview.relativePath, nextText)
      .then((result) => {
        savedTextRef.current = nextText;
        setIsDirty(false);
        if (result) {
          const cacheKey = getPreviewCacheKey(
            result.workspaceKey,
            result.relativePath,
          );
          previewCache.set(cacheKey, { preview: result, error: null });
          textDraftCache.set(cacheKey, nextText);
        }
      })
      .finally(() => {
        setIsSaving(false);
        refreshActionState();
      });
  }, [editorRef, isSaving, preview, refreshActionState, saveFile]);

  const undo = useCallback(() => {
    editorRef.current?.trigger('file-preview-toolbar', 'undo', undefined);
    refreshActionState();
  }, [editorRef, refreshActionState]);

  const redo = useCallback(() => {
    editorRef.current?.trigger('file-preview-toolbar', 'redo', undefined);
    refreshActionState();
  }, [editorRef, refreshActionState]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const contentDisposable = editor.onDidChangeModelContent(() => {
      window.setTimeout(refreshActionState, 0);
    });
    const cursorDisposable = editor.onDidChangeCursorSelection(() => {
      window.setTimeout(refreshActionState, 0);
    });

    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
    };
  }, [editorRef, refreshActionState]);

  return {
    save,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    isSaving,
  } satisfies EditorActions;
}

function ToolbarTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FileTabToolbar({
  actions,
  right,
}: {
  actions: EditorActions | null;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-border-subtle border-b bg-background px-1">
      <div className="flex items-center">
        <div className="flex items-center px-1">
          <ToolbarTooltip label="Save file">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Save file"
              disabled={!actions?.isDirty || actions.isSaving}
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
          <ToolbarTooltip label="Undo">
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
          <ToolbarTooltip label="Redo">
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
      </div>
      {right ? <div className="flex items-center gap-1">{right}</div> : null}
    </div>
  );
}

function useFileCodeZoom(tabId: string) {
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

  useHotKeyListener(zoomIn, HotkeyActions.ZOOM_IN);
  useHotKeyListener(zoomOut, HotkeyActions.ZOOM_OUT);
  useHotKeyListener(zoomReset, HotkeyActions.ZOOM_RESET);

  return {
    fontSize: (12 * zoomPercentage) / 100,
    markFocused,
    updateZoom,
    zoomPercentage,
    zoomPercentageRef,
  };
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
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const actions = useEditorActions(editorRef, preview, text);

  useEffect(() => {
    setText(textDraftCache.get(cacheKey) ?? preview.text ?? '');
  }, [cacheKey, preview.text]);

  const handleMount = useCallback(
    (editor: MonacoEditorInstance, monaco: MonacoApi) => {
      editorRef.current = editor;
      editor.onDidFocusEditorWidget(markFocused);
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
    },
    [markFocused, updateZoom, zoomPercentageRef],
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
    editorRef.current?.updateOptions({
      fontSize,
      lineHeight: fontSize * 1.5,
    });
  }, [fontSize]);

  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={actions}
        right={
          <SearchableSelect
            items={SOURCE_LANGUAGE_ITEMS}
            value={language}
            onValueChange={(value) => setLanguage(value as SourceLanguage)}
            size="xs"
            triggerVariant="ghost"
            triggerClassName="h-6 rounded-none"
            side="bottom"
          />
        }
      />
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
            readOnly: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            renderLineHighlight: 'line',
            fontFamily:
              "'Roboto Mono', Menlo, Monaco, stagewise-builtin-roboto-mono, 'Noto Sans Mono', ui-monospace, 'SF Mono', 'Segoe UI Mono', 'Ubuntu Mono', 'Noto Mono', 'Liberation Mono', 'Inter Mono', Consolas, monospace",
            fontSize,
            lineHeight: fontSize * 1.5,
          }}
        />
      </div>
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

function useImagePanAndZoom(tabId: string) {
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

  useHotKeyListener(handleZoomIn, HotkeyActions.ZOOM_IN);
  useHotKeyListener(handleZoomOut, HotkeyActions.ZOOM_OUT);
  useHotKeyListener(handleZoomReset, HotkeyActions.ZOOM_RESET);

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
  tabId,
}: {
  preview: FilePreviewResult;
  tabId: string;
}) {
  if (!preview.base64) {
    return (
      <div className="flex size-full flex-col bg-background">
        <FileTabToolbar actions={null} />
        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-sm">
          Image is too large to preview.
        </div>
      </div>
    );
  }
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
  const dataUrl = `data:${preview.mimeType};base64,${preview.base64}`;
  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={null}
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
        <img
          src={dataUrl}
          alt={preview.relativePath}
          className="pointer-events-none max-h-none max-w-none object-contain"
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        />
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
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [text, setText] = useState(
    () => textDraftCache.get(cacheKey) ?? preview.text ?? '',
  );
  const {
    fontSize: sourceFontSize,
    markFocused: markSourceFocused,
    updateZoom: updateSourceZoom,
    zoomPercentageRef: sourceZoomPercentageRef,
  } = useFileCodeZoom(tabId);
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(() =>
    languageFromPath(preview.relativePath),
  );
  const [background, setBackground] = useState<SvgPreviewBackground>('default');
  const [customBackground, setCustomBackground] = useState('ffffff');
  const [currentColorMode, setCurrentColorMode] =
    useState<SvgCurrentColorMode>('default');
  const [customCurrentColor, setCustomCurrentColor] = useState('8b5cf6');
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const actions = useEditorActions(editorRef, preview, text);
  const previewBackgroundClassName = getPreviewBackgroundClassName(background);
  const normalizedCustomBackground = normalizeHexColor(
    customBackground,
    '#ffffff',
  );
  const normalizedCustomCurrentColor = normalizeHexColor(
    customCurrentColor,
    '#8b5cf6',
  );
  const previewCurrentColor =
    currentColorMode === 'custom'
      ? normalizedCustomCurrentColor
      : background === 'dark'
        ? 'var(--color-base-50)'
        : background === 'light'
          ? 'var(--color-base-900)'
          : 'var(--color-foreground)';
  const dataUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`,
    [text],
  );

  useEffect(() => {
    setText(textDraftCache.get(cacheKey) ?? preview.text ?? '');
  }, [cacheKey, preview.text]);

  const handleMount = useCallback(
    (editor: MonacoEditorInstance, monaco: MonacoApi) => {
      editorRef.current = editor;
      editor.onDidFocusEditorWidget(markSourceFocused);
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
        markSourceFocused();
        updateSourceZoom(sourceZoomPercentageRef.current + 10);
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
        markSourceFocused();
        updateSourceZoom(sourceZoomPercentageRef.current - 10);
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
        markSourceFocused();
        updateSourceZoom(100);
      });
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
    editorRef.current?.updateOptions({
      fontSize: sourceFontSize,
      lineHeight: sourceFontSize * 1.5,
    });
  }, [sourceFontSize]);

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
  } = useImagePanAndZoom(tabId);

  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar
        actions={actions}
        right={
          <>
            {mode === 'preview' && isPanned ? (
              <div className="flex items-center pr-2 pl-1">
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
            {mode === 'preview' ? (
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
            ) : null}
            {mode === 'preview' ? (
              <>
                <div className="h-5 w-px bg-border-subtle" />
                <div className="flex items-center px-1">
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
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <IconTextBgColorOutline18 className="size-3" />
                            Background
                          </span>
                          <Select<SvgPreviewBackground>
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
                        <div className="flex flex-col gap-1.5">
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <IconTextColorOutline18 className="size-3" />
                            Foreground
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
                </div>
              </>
            ) : null}
            {mode === 'source' ? (
              <div className="flex items-center px-1">
                <SearchableSelect
                  items={SOURCE_LANGUAGE_ITEMS}
                  value={sourceLanguage}
                  onValueChange={(value) =>
                    setSourceLanguage(value as SourceLanguage)
                  }
                  size="xs"
                  triggerVariant="ghost"
                  triggerClassName="h-6 rounded-none"
                  side="bottom"
                />
              </div>
            ) : null}
            <div className="flex h-7 items-center gap-1 rounded-md bg-surface-1 p-0.5">
              <button
                type="button"
                className={cn(
                  'flex h-full items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                  mode === 'source' &&
                    'bg-background text-foreground ring-1 ring-border-subtle',
                )}
                aria-label="Show SVG source"
                aria-pressed={mode === 'source'}
                onClick={() => setMode('source')}
              >
                <IconSquareCodeOutline18 className="size-3.5" />
                {mode === 'source' ? <span>Code</span> : null}
              </button>
              <button
                type="button"
                className={cn(
                  'flex h-full items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                  mode === 'preview' &&
                    'bg-background text-foreground ring-1 ring-border-subtle',
                )}
                aria-label="Show SVG preview"
                aria-pressed={mode === 'preview'}
                onClick={() => setMode('preview')}
              >
                <IconEye2Outline18 className="size-3.5" />
                {mode === 'preview' ? <span>Preview</span> : null}
              </button>
            </div>
          </>
        }
      />
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
            <img
              src={dataUrl}
              alt={preview.relativePath}
              className="pointer-events-none max-h-none max-w-none object-contain"
              draggable={false}
              style={{
                color: previewCurrentColor,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center',
              }}
            />
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
                readOnly: false,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                renderLineHighlight: 'line',
                fontFamily:
                  "'Roboto Mono', Menlo, Monaco, stagewise-builtin-roboto-mono, 'Noto Sans Mono', ui-monospace, 'SF Mono', 'Segoe UI Mono', 'Ubuntu Mono', 'Noto Mono', 'Liberation Mono', 'Inter Mono', Consolas, monospace",
                fontSize: sourceFontSize,
                lineHeight: sourceFontSize * 1.5,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BinaryPreview() {
  return (
    <div className="flex size-full flex-col bg-background">
      <FileTabToolbar actions={null} />
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <IconDatabaseFillDuo18 className="size-12" />
          <span className="font-normal text-muted-foreground text-xs">
            Binary file
          </span>
        </div>
      </div>
    </div>
  );
}

export function FilePreviewTabContent({ tab }: FilePreviewTabContentProps) {
  const getFilePreview = useKartonProcedure((p) => p.fileTree.getFilePreview);
  const workspaceKey = tab.file?.workspaceKey;
  const relativePath = tab.file?.relativePath;
  const cacheKey =
    workspaceKey && relativePath
      ? getPreviewCacheKey(workspaceKey, relativePath)
      : null;
  const cached = cacheKey ? previewCache.get(cacheKey) : undefined;
  const [preview, setPreview] = useState<FilePreviewResult | null>(
    cached?.preview ?? null,
  );
  const [error, setError] = useState<string | null>(cached?.error ?? null);
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
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
  }, [workspaceKey, relativePath, cacheKey, getFilePreview]);

  if (!tab.file) {
    return (
      <div className="flex size-full items-center justify-center bg-background text-muted-foreground text-sm">
        Missing file metadata.
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
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
        ) : error || !preview ? (
          <div className="flex size-full flex-col bg-background">
            <FileTabToolbar actions={null} />
            <div className="flex min-h-0 flex-1 items-center justify-center text-error-foreground text-sm">
              {error ?? 'Failed to load file'}
            </div>
          </div>
        ) : preview.truncated ? (
          <div className="flex size-full flex-col">
            <FileTabToolbar actions={null} />
            <div className="shrink-0 border-border border-b px-3 py-1 text-warning-foreground text-xs">
              Preview truncated
            </div>
            <div className="min-h-0 flex-1">
              {preview.kind === 'text' || preview.kind === 'svg' ? (
                <TextEditorPreview preview={preview} tabId={tab.id} />
              ) : (
                <BinaryPreview />
              )}
            </div>
          </div>
        ) : preview.kind === 'image' ? (
          <ImagePreview preview={preview} tabId={tab.id} />
        ) : preview.kind === 'svg' ? (
          <SvgPreview preview={preview} tabId={tab.id} />
        ) : preview.kind === 'text' ? (
          <TextEditorPreview preview={preview} tabId={tab.id} />
        ) : (
          <BinaryPreview />
        )}
      </div>
    </div>
  );
}
