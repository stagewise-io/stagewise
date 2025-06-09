import { Panel } from '@/plugin-ui/components/panel';
import { ToolbarButton } from './button';
import { ToolbarSection } from './section';
import { SettingsIcon, RefreshCwIcon } from 'lucide-react';
import { useVSCode } from '@/hooks/use-vscode';

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
      <Panel.Content>
        <ProjectInfoSection />
      </Panel.Content>
    </Panel>
  );
};

const ConnectionSettings = () => {
  const {
    windows,
    isDiscovering,
    discoveryError,
    discover,
    selectedSession,
    selectSession,
  } = useVSCode();

  const handleSessionChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const selectedSessionId = target.value || undefined;
    selectSession(selectedSessionId);
  };

  const { appName } = useVSCode();

  const handleRefresh = () => {
    discover();
  };

  return (
    <div className="space-y-4 pb-4">
      <div>
        <label
          htmlFor="session-select"
          className="mb-2 block font-medium text-sm text-zinc-700"
        >
          IDE Window {appName && `(${appName})`}
        </label>
        <div className="flex w-full items-center space-x-2">
          <select
            id="session-select"
            value={selectedSession?.sessionId || ''}
            onChange={handleSessionChange}
            className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-500/10 px-3 text-sm backdrop-saturate-150 focus:border-zinc-500 focus:outline-none"
            disabled={isDiscovering}
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
            disabled={isDiscovering}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-500/10 backdrop-saturate-150 transition-colors hover:bg-zinc-500/20 disabled:opacity-50"
            title="Refresh window list"
          >
            <RefreshCwIcon
              className={`size-4 ${isDiscovering ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
        {discoveryError && (
          <p className="mt-1 text-red-600 text-sm">
            Error discovering windows: {discoveryError}
          </p>
        )}
        {!isDiscovering && windows.length === 0 && !discoveryError && (
          <p className="mt-1 text-sm text-zinc-500">
            No IDE windows found. Make sure the Stagewise extension is installed
            and running.
          </p>
        )}
      </div>

      {selectedSession && (
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-blue-800 text-sm">
            <strong>Selected:</strong> {selectedSession.displayName}
          </p>
          <p className="mt-1 text-blue-600 text-xs">
            Session ID: {selectedSession.sessionId.substring(0, 8)}...
          </p>
        </div>
      )}

      {!selectedSession && (
        <div>
          <p className="text-sm text-zinc-600">
            <strong>Auto-detect mode:</strong> Commands will be sent to any
            available IDE window.
          </p>
        </div>
      )}
    </div>
  );
};

const ProjectInfoSection = () => (
  <div className="space-y-2 text-xs text-zinc-700">
    <div className="my-2 flex flex-wrap items-center gap-3">
      <a
        href="https://github.com/stagewise-io/stagewise"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-blue-700 hover:underline"
        title="GitHub Repository"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .98-.31 3.2 1.18a11.1 11.1 0 0 1 2.92-.39c.99 0 1.99.13 2.92.39 2.22-1.49 3.2-1.18 3.2-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.7.42.36.79 1.08.79 2.18 0 1.57-.01 2.84-.01 3.23 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12c0-6.27-5.23-11.5-12-11.5z" />
        </svg>
        GitHub
      </a>
      <a
        href="https://discord.gg/gkdGsDYaKA"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-indigo-700 hover:underline"
        title="Join our Discord"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.369A19.791 19.791 0 0 0 16.885 3.2a.117.117 0 0 0-.124.06c-.537.96-1.13 2.22-1.552 3.2a18.524 18.524 0 0 0-5.418 0c-.423-.98-1.016-2.24-1.553-3.2a.117.117 0 0 0-.124-.06A19.736 19.736 0 0 0 3.683 4.369a.105.105 0 0 0-.047.043C.533 9.043-.32 13.579.099 18.057a.12.12 0 0 0 .045.083c1.934 1.426 3.81 2.288 5.671 2.857a.116.116 0 0 0 .127-.043c.438-.602.827-1.24 1.165-1.908a.112.112 0 0 0-.062-.158c-.619-.234-1.205-.52-1.77-.853a.117.117 0 0 1-.012-.194c.119-.09.238-.183.353-.277a.112.112 0 0 1 .114-.013c3.747 1.71 7.789 1.71 11.533 0a.112.112 0 0 1 .115.012c.115.094.234.188.353.278a.117.117 0 0 1-.012.194c-.565.333-1.151.619-1.77.853a.112.112 0 0 0-.062.158c.34.668.728 1.306 1.165 1.908a.115.115 0 0 0 .127.043c1.861-.569 3.737-1.431 5.671-2.857a.12.12 0 0 0 .045-.083c.5-5.177-.838-9.673-3.636-13.645a.105.105 0 0 0-.047-.043zM8.02 15.331c-1.183 0-2.156-1.085-2.156-2.419 0-1.333.955-2.418 2.156-2.418 1.21 0 2.175 1.095 2.156 2.418 0 1.334-.955 2.419-2.156 2.419zm7.96 0c-1.183 0-2.156-1.085-2.156-2.419 0-1.333.955-2.418 2.156-2.418 1.21 0 2.175 1.095 2.156 2.418 0 1.334-.946 2.419-2.156 2.419z" />
        </svg>
        Discord
      </a>
      <a
        href="https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-violet-700 hover:underline"
        title="VS Code Marketplace"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21.805 2.29a2.25 2.25 0 0 0-2.45-.49l-7.5 3.25a2.25 2.25 0 0 0-1.31 2.06v1.13l-5.13 2.22a2.25 2.25 0 0 0-1.31 2.06v3.5a2.25 2.25 0 0 0 1.31 2.06l5.13 2.22v1.13a2.25 2.25 0 0 0 1.31 2.06l7.5 3.25a2.25 2.25 0 0 0 2.45-.49A2.25 2.25 0 0 0 23 20.25V3.75a2.25 2.25 0 0 0-1.195-1.46zM12 20.25v-16.5l7.5 3.25v10l-7.5 3.25z" />
        </svg>
        VS Code Marketplace
      </a>
    </div>
    <div className="mt-2">
      <span className="font-semibold">Contact:</span>{' '}
      <a
        href="mailto:sales@stagewise.io"
        className="text-blue-700 hover:underline"
      >
        sales@stagewise.io
      </a>
    </div>
    <div className="mt-2 text-zinc-500">
      <span>
        Licensed under AGPL v3.{' '}
        <a
          href="https://github.com/stagewise-io/stagewise/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          View license
        </a>
      </span>
    </div>
  </div>
);
