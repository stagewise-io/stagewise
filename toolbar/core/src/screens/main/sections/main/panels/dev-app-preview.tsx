import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';

export const DevAppPreviewPanel = () => {
  // Get the initial URL from the parent window
  // Ensure we have a valid path (default to '/' if empty)
  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const initialUrl = pathname + search + hash;

  return (
    <div className="glass-body size-full overflow-hidden rounded-xl">
      <iframe
        src={initialUrl}
        title="Main user app"
        className="size-full p-0"
        id="user-app-iframe"
      />
      <DOMContextSelector />
    </div>
  );
};
