// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { ToolbarArea } from '@/components/toolbar/canvas';
import { cn } from '@/utils';
import { SelectorCanvas } from '../dom-context/selector-canvas';

export function DesktopLayout() {
  return (
    <div className={cn('fixed inset-0 h-screen w-screen')}>
      <SelectorCanvas />
      <ToolbarArea />
    </div>
  );
}
