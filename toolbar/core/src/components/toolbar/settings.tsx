import { Panel } from '@/plugin-ui/components/panel';
import { ToolbarButton } from './button';
import { ToolbarSection } from './section';
import { SettingsIcon, RefreshCwIcon } from 'lucide-react';
import { useWindowDiscovery } from '@/hooks/use-window-discovery';
import { useSessionManager } from '@/hooks/use-session';

export const SettingsButton = ({
  onOpenPanel,
  isActive = false,
}: { onOpenPanel: () => void; isActive?: boolean }) => (
  <ToolbarSection>
    <ToolbarButton onClick={onOpenPanel} active={isActive}>
      <SettingsIcon className="size-4" />
    </ToolbarButton>
  </ToolbarSection>
);

export const SettingsPanel = ({ onClose }: { onClose?: () => void }) => {
  return (
    <Panel>
      <Panel.Header title="Settings" />
      <Panel.Content>
        <ConnectionSettings />
      </Panel.Content>
    </Panel>
  );
};

const ConnectionSettings = () => {
  const { windows, isLoading, error, discover } = useWindowDiscovery();
  const { sessionId, setSessionId } = useSessionManager();

  const handleSessionChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const selectedSessionId = target.value || undefined;
    setSessionId(selectedSessionId);
  };

  const handleRefresh = () => {
    discover();
  };
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="session-select"
          className="mb-2 block font-medium text-gray-700 text-sm"
        >
          VS Code Window
        </label>
        <div className="flex items-center space-x-2">
          <select
            id="session-select"
            value={sessionId || ''}
            onChange={handleSessionChange}
            className="h-8 flex-1 rounded-lg border border-zinc-300 bg-zinc-500/10 px-3 text-sm backdrop-saturate-150 focus:border-zinc-500 focus:outline-none"
            disabled={isLoading}
          >
            <option value="">Auto-detect (any window)</option>
            {windows.map((window) => (
              <option key={window.sessionId} value={window.sessionId}>
                {window.displayName} - Port {window.port}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10 backdrop-saturate-150 transition-colors hover:bg-zinc-500/20 disabled:opacity-50"
            title="Refresh window list"
          >
            <RefreshCwIcon
              className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
        {error && (
          <p className="mt-1 text-red-600 text-sm">
            Error discovering windows: {error}
          </p>
        )}
        {!isLoading && windows.length === 0 && !error && (
          <p className="mt-1 text-gray-500 text-sm">
            No VS Code windows found. Make sure the Stagewise extension is
            installed and running.
          </p>
        )}
      </div>

      {sessionId && (
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-blue-800 text-sm">
            <strong>Selected:</strong>{' '}
            {windows.find((w) => w.sessionId === sessionId)?.displayName ||
              'Unknown window'}
          </p>
          <p className="mt-1 text-blue-600 text-xs">
            Session ID: {sessionId.substring(0, 8)}...
          </p>
        </div>
      )}

      {!sessionId && (
        <div>
          <p className="text-gray-600 text-sm">
            <strong>Auto-detect mode:</strong> Commands will be sent to any
            available VS Code window.
          </p>
        </div>
      )}
    </div>
  );
};
