import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from '@stagewise/stage-ui/components/combobox';
import type { ToolApprovalMode } from '@shared/karton-contracts/ui/shared-types';
import { IconChevronDownFill18 } from 'nucleo-ui-fill-18';
import { IconTriangleWarningOutline18 } from 'nucleo-ui-outline-18';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@ui/utils';

interface ToolApprovalOption {
  value: ToolApprovalMode;
  label: string;
  title: string;
  description: string;
}

const OPTIONS: ToolApprovalOption[] = [
  {
    value: 'alwaysAsk',
    label: 'Always ask',
    title: 'Ask before shell commands',
    description:
      'This agent will pause and ask for your approval before running any shell command.',
  },
  {
    value: 'alwaysAllow',
    label: 'Always allow',
    title: 'Skip future approvals',
    description:
      'This agent will run every shell command without asking. Only enable this if you trust what this agent is about to do.',
  },
];

interface ToolApprovalSelectProps {
  onToolApprovalChange?: () => void;
}

export const ToolApprovalSelect = memo(function ToolApprovalSelect({
  onToolApprovalChange,
}: ToolApprovalSelectProps) {
  const [openAgent] = useOpenAgent();
  const currentMode = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.toolApprovalMode ?? 'alwaysAsk')
      : null,
  );
  const setToolApprovalMode = useKartonProcedure(
    (p) => p.agents.setToolApprovalMode,
  );

  const currentLabel = useMemo(() => {
    if (!currentMode) return 'Always ask';
    return OPTIONS.find((o) => o.value === currentMode)?.label ?? currentMode;
  }, [currentMode]);

  // Side-panel hover state
  const containerRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [hoveredOption, setHoveredOption] = useState<ToolApprovalOption | null>(
    null,
  );
  const [itemCenterY, setItemCenterY] = useState(0);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);

  useLayoutEffect(() => {
    if (!hoveredOption || !sidePanelRef.current || !containerRef.current)
      return;
    const panelHeight = sidePanelRef.current.offsetHeight;
    const containerHeight = containerRef.current.offsetHeight;

    // Clamp both bounds to non-negative values so that when the panel is
    // taller than the container we fall back to 0 (top-aligned) instead of
    // pushing the panel to a negative `top`.
    const maxOffset = Math.max(0, containerHeight - panelHeight);
    const offset = Math.max(
      0,
      Math.min(itemCenterY - panelHeight / 2, maxOffset),
    );

    setSidePanelOffset(offset);
  }, [hoveredOption, itemCenterY]);

  const handleItemHover = useCallback(
    (option: ToolApprovalOption, element: HTMLElement) => {
      const container = containerRef.current;
      if (!container) {
        setHoveredOption(option);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const itemRect = element.getBoundingClientRect();
      const centerY = itemRect.top + itemRect.height / 2 - containerRect.top;

      setItemCenterY(centerY);
      setHoveredOption(option);
    },
    [],
  );

  const handleValueChange = useCallback(
    (value: string | null) => {
      if (!openAgent || !value) return;
      // `'panel-combobox'` tags this as a deliberate, pre-emptive change
      // in the backend telemetry event — distinguishes it from inline
      // "Always allow" clicks during an approval request.
      void setToolApprovalMode(
        openAgent,
        value as ToolApprovalMode,
        'panel-combobox',
      ).catch((error) => {
        console.warn('[ToolApprovalSelect] Failed to set mode', error);
      });
      onToolApprovalChange?.();
    },
    [openAgent, setToolApprovalMode, onToolApprovalChange],
  );

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setHoveredOption(null);
    }
  }, []);

  return (
    <Combobox
      value={currentMode}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      filter={null}
    >
      <ComboboxBase.Trigger
        className={cn(
          'inline-flex min-w-0 max-w-full cursor-pointer items-center justify-between gap-1 rounded-lg p-0 font-normal text-xs shadow-none transition-colors',
          'focus-visible:-outline-offset-2 focus-visible:outline-1 focus-visible:outline-muted-foreground/35',
          'has-disabled:pointer-events-none has-disabled:opacity-50',
          'bg-transparent text-muted-foreground hover:text-foreground data-popup-open:text-foreground',
          'h-4 w-auto',
        )}
        disabled={!openAgent}
      >
        {currentMode === 'alwaysAllow' && (
          <IconTriangleWarningOutline18 className="size-3 shrink-0" />
        )}
        <span className="truncate">{currentLabel}</span>
        <ComboboxBase.Icon className="shrink-0">
          <IconChevronDownFill18 className="size-3" />
        </ComboboxBase.Icon>
      </ComboboxBase.Trigger>

      <ComboboxBase.Portal>
        <ComboboxBase.Backdrop className="fixed inset-0 z-50" />
        <ComboboxBase.Positioner
          side="top"
          sideOffset={4}
          align="start"
          className="z-50"
        >
          <div
            ref={containerRef}
            className="relative flex flex-row items-start gap-1"
            onMouseLeave={() => setHoveredOption(null)}
          >
            <ComboboxBase.Popup
              className={cn(
                'flex max-w-72 origin-(--transform-origin) flex-col items-stretch gap-0.5 text-xs',
                'rounded-lg border border-border-subtle bg-background p-1 shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'data-ending-style:scale-90 data-ending-style:opacity-0',
                'data-starting-style:scale-90 data-starting-style:opacity-0',
              )}
            >
              <ComboboxList>
                {OPTIONS.map((option) => (
                  <ToolApprovalItem
                    key={option.value}
                    option={option}
                    onHighlight={handleItemHover}
                  />
                ))}
              </ComboboxList>
            </ComboboxBase.Popup>

            {hoveredOption && (
              <div
                ref={sidePanelRef}
                className={cn(
                  'absolute left-full ml-1 flex w-72 flex-col gap-1 rounded-lg border border-derived bg-background p-2.5 text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
                  'fade-in-0 slide-in-from-left-1 animate-in duration-150',
                )}
                style={{ top: sidePanelOffset }}
              >
                <div className="font-semibold">{hoveredOption.title}</div>
                <div className="text-muted-foreground">
                  {hoveredOption.description}
                </div>
              </div>
            )}
          </div>
        </ComboboxBase.Positioner>
      </ComboboxBase.Portal>
    </Combobox>
  );
});

const ToolApprovalItem = memo(function ToolApprovalItem({
  option,
  onHighlight,
}: {
  option: ToolApprovalOption;
  onHighlight: (option: ToolApprovalOption, element: HTMLElement) => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      if (el.hasAttribute('data-highlighted')) onHighlight(option, el);
    });

    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-highlighted'],
    });

    return () => observer.disconnect();
  }, [option, onHighlight]);

  return (
    <ComboboxItem ref={itemRef} value={option.value} size="xs">
      <ComboboxItemIndicator />
      <span className="col-start-2 truncate">{option.label}</span>
    </ComboboxItem>
  );
});
