import type { ReactNode } from 'react';

export function CommandCenterOverlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="app-no-drag fixed inset-0 z-100 flex items-start justify-center bg-overlay/55 p-6">
      <button
        type="button"
        aria-label="Close command center"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative top-[calc((100vh-(44vh+2.5rem))/2)] z-10 w-[min(640px,calc(100vw-3rem))]">
        {children}
      </div>
    </div>
  );
}
