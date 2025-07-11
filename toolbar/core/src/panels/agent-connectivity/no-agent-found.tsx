export function NoAgentFound() {
  return (
    <div className="space-y-2 text-foreground text-sm">
      <p className="font-medium">To connect:</p>
      <ol className="list-inside list-decimal space-y-1 pl-2 text-sm">
        <li>Open your IDE (Cursor, Windsurf, etc.)</li>
        <li>Install the stagewise extension</li>
        <li>Make sure the extension is active</li>
        <li>Click refresh in the toolbar</li>
      </ol>
    </div>
  );
}
