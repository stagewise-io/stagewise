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
  onPromptSend: (prompt) => {
    const content = getSelectedElementsPrompt(prompt.contextElements);

    if (!content) {
      return { contextSnippets: [] };
    }

    return {
      contextSnippets: [
        {
          promptContextName: 'elements-angular-component-info',
          content: content,
        },
      ],
    };
  },
};
