import type { ToolbarPlugin } from '@stagewise/toolbar';
import { AngularLogo } from './logo';
import {
  getSelectedElementsPrompt,
  getSelectedElementAnnotation,
} from './utils';

const AngularPlugin: ToolbarPlugin = {
  displayName: 'Angular',
  description:
    'This plugin adds additional information and metadata for apps using Angular as a UI framework',
  iconSvg: <AngularLogo />,
  pluginName: 'angular',
  onContextElementHover: getSelectedElementAnnotation,
  onContextElementSelect: getSelectedElementAnnotation,
  onPromptSend: (prompt) => {
    const content = getSelectedElementsPrompt(prompt.metadata.selectedElements);

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

export default AngularPlugin;
