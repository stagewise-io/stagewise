import { RefreshCwIcon } from 'lucide-react';
import { useVSCode } from '@/hooks/use-vscode';

export function WindowSelectionPanel() {
  const {
    windows,
    isDiscovering,
    discoveryError,
    discover,
    selectedSession,
    selectSession,
    appName,
  } = useVSCode();

  const handleSessionChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const selectedSessionId = target.value === '' ? undefined : target.value;
    selectSession(selectedSessionId);
  };

  const handleRefresh = () => {
    discover();
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
      <div className="mb-3">
        <h3 className="font-semibold text-blue-800">Select IDE Window</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="window-selection-select"
            className="mb-2 block font-medium text-blue-700 text-sm"
          >
            IDE Window {appName && `(${appName})`}
          </label>
          <div className="flex w-full items-center space-x-2">
            <select
              id="window-selection-select"
              value={selectedSession?.sessionId || ''}
              onChange={handleSessionChange}
              className="h-8 min-w-0 flex-1 rounded-lg border border-blue-300 bg-white/80 px-3 text-sm backdrop-saturate-150 focus:border-blue-500 focus:outline-none"
              disabled={isDiscovering}
            >
              <option value="" disabled>
                {windows.length > 0
                  ? 'Select an IDE window...'
                  : 'No windows available'}
              </option>
              {windows.map((window) => (
                <option key={window.sessionId} value={window.sessionId}>
                  {window.displayName} - Port {window.port}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isDiscovering}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100/80 backdrop-saturate-150 transition-colors hover:bg-blue-200/80 disabled:opacity-50"
              title="Refresh window list"
            >
              <RefreshCwIcon
                className={`size-4 text-blue-600 ${isDiscovering ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {discoveryError && (
            <p className="mt-1 text-red-600 text-sm">
              Error discovering windows: {discoveryError}
            </p>
          )}

          {!isDiscovering && windows.length === 0 && !discoveryError && (
            <p className="mt-1 text-blue-600 text-sm">
              No IDE windows found. Make sure the Stagewise extension is
              installed and running.
            </p>
          )}
        </div>

        {selectedSession && (
          <div className="rounded-lg bg-blue-100/80 p-3">
            <p className="text-blue-800 text-sm">
              <strong>Selected:</strong> {selectedSession.displayName}
            </p>
            <p className="mt-1 text-blue-600 text-xs">
              Session ID: {selectedSession.sessionId.substring(0, 8)}...
            </p>
          </div>
        )}

        {!selectedSession && (
          <div className="rounded-lg border border-blue-200 bg-white/90 p-3">
            <p className="text-blue-800 text-sm">
              <strong>No window selected:</strong> Please select an IDE window
              above to connect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
