import { RefreshCwIcon } from 'lucide-react';

export function ConnectingStatePanel() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <RefreshCwIcon className="size-5 animate-spin text-blue-600" />
        <h3 className="font-semibold text-blue-800">Connecting...</h3>
      </div>

      <div className="text-blue-700 text-sm">
        <p>
          Looking for active agent instances...
          <br />
          <span className="text-blue-500 text-xs">
            VS Code, Cursor, Windsurf ...
          </span>
        </p>
      </div>
    </div>
  );
}
