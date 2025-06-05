import type { ToolbarPlugin } from '@stagewise/toolbar';
import { AngularLogo } from './logo';
import {
  getSelectedElementsPrompt,
  getSelectedElementAnnotation,
} from './utils';

export const AngularPlugin: ToolbarPlugin = {
  displayName: 'Angular',
  description:
    'This toolbar adds additional information and metadata for apps using Angular as a UI framework',
  iconSvg: <AngularLogo />,
  pluginName: 'angular',
  onContextElementHover: getSelectedElementAnnotation,
  onContextElementSelect: getSelectedElementAnnotation,
  onPromptSend: (prompt) => ({
    contextSnippets: [
      {
        promptContextName: 'elements-angular-component-info',
        content: getSelectedElementsPrompt(prompt.contextElements),
      },
    ],
  }),
};
