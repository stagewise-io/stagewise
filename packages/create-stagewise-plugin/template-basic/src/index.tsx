'use client';
import type { ToolbarPlugin } from '@stagewise/toolbar';
import {
  type FunctionalComponent,
  ToolbarButton,
} from '@stagewise/toolbar/plugin-ui';

const ExampleToolbarAction: FunctionalComponent = () => {
  return <ToolbarButton> Test </ToolbarButton>;
};

export const ExamplePlugin: ToolbarPlugin = {
  displayName: 'Example',
  description: 'Example Plugin',
  iconSvg: null,
  pluginName: 'example',
  onLoad: (toolbar) => {
    toolbar.renderToolbarAction(ExampleToolbarAction);
  },
};
