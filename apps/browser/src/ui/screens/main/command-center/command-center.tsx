import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  COMMAND_CENTER_MODES,
  type CommandCenterItem,
} from './command-center-model';
import { useCommandCenter } from './command-center-context';
import { useCommandCenterItems } from './sources/use-command-center-items';
import { CommandCenterInput } from './_components/command-center-input';
import { CommandCenterOverlay } from './_components/command-center-overlay';
import { CommandCenterPanel } from './_components/command-center-panel';
import { CommandCenterResults } from './_components/command-center-results';

export function CommandCenter() {
  const { isOpen, query, mode, selectFirstOnOpen, close, setQuery, setMode } =
    useCommandCenter();
  const { items, isLoading } = useCommandCenterItems({ query, mode });
  const [, setOpenAgent] = useOpenAgent();
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const setLastOpenAgentId = useKartonProcedure(
    (p) => p.browser.setLastOpenAgentId,
  );
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(selectFirstOnOpen ? 0 : -1);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen, mode, query, selectFirstOnOpen]);

  useEffect(() => {
    if (selectedIndex < items.length) return;
    setSelectedIndex(items.length > 0 ? items.length - 1 : 0);
  }, [items.length, selectedIndex]);

  const executeItem = useCallback(
    (item: CommandCenterItem) => {
      if (item.disabled) return;

      if (item.kind === 'agent') {
        setOpenAgent(item.agentId);
        void resumeAgent(item.agentId);
        void setLastOpenAgentId(item.agentId);
      } else if (item.kind === 'tab') {
        void switchTab(item.tabId);
      } else if (item.kind === 'setting') {
        void createTab(item.url, true);
      }

      close();
    },
    [
      close,
      createTab,
      resumeAgent,
      setLastOpenAgentId,
      setOpenAgent,
      switchTab,
    ],
  );

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (items.length === 0) return;
      setSelectedIndex(
        (current) => (current + direction + items.length) % items.length,
      );
    },
    [items.length],
  );

  const cycleMode = useCallback(
    (direction: 1 | -1) => {
      const index = COMMAND_CENTER_MODES.indexOf(mode);
      setMode(
        COMMAND_CENTER_MODES[
          (index + direction + COMMAND_CENTER_MODES.length) %
            COMMAND_CENTER_MODES.length
        ]!,
      );
    },
    [mode, setMode],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        const item = items[selectedIndex];
        if (item) executeItem(item);
        return;
      }

      if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(1);
        return;
      }

      if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(-1);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        cycleMode(event.shiftKey ? -1 : 1);
      }
    },
    [close, cycleMode, executeItem, items, moveSelection, selectedIndex],
  );

  if (!isOpen) return null;

  return (
    <CommandCenterOverlay onClose={close}>
      <div onKeyDown={handleKeyDown}>
        <CommandCenterPanel>
          <CommandCenterInput
            ref={inputRef}
            query={query}
            mode={mode}
            onQueryChange={setQuery}
            onModeChange={setMode}
          />
          <CommandCenterResults
            items={items}
            mode={mode}
            selectedIndex={selectedIndex}
            isLoading={isLoading}
            onSelect={executeItem}
            onHoverIndex={setSelectedIndex}
          />
        </CommandCenterPanel>
      </div>
    </CommandCenterOverlay>
  );
}
