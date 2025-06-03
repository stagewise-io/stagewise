import { RefreshCwIcon } from 'lucide-react';
import { WifiOffIcon } from 'lucide-react';

export function DisconnectedStatePanel({
  discover,
  discoveryError,
}: {
  discover: () => Promise<void>;
  discoveryError: string | null;
}) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/90 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <WifiOffIcon className="size-5 text-orange-600" />
        <h3 className="font-semibold text-orange-800">Not Connected</h3>
      </div>

      <div className="space-y-3 text-orange-700 text-sm">
        <p>The stagewise toolbar isn&apos;t connected to any IDE window.</p>

        {discoveryError && (
          <div className="rounded border border-red-200 bg-red-100 p-2 text-red-700">
            <strong>Error:</strong> {discoveryError}
          </div>
        )}

        <div className="space-y-2">
          <p className="font-medium">To connect:</p>
          <ol className="list-inside list-decimal space-y-1 pl-2 text-xs">
            <li>Open your IDE (Cursor, Windsurf, etc.)</li>
            <li>Install the stagewise extension</li>
            <li>Make sure the extension is active</li>
            <li>Click refresh below</li>
          </ol>
        </div>

        <button
          type="button"
          onClick={discover}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-orange-700"
        >
          <RefreshCwIcon className="size-4" />
          Retry Connection
        </button>

        <div className="border-orange-200 border-t pt-2">
          <a
            href="https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise-vscode-extension"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 text-xs hover:text-orange-800 hover:underline"
          >
            Get VS Code Extension →
          </a>
        </div>
      </div>
    </div>
  );
}
