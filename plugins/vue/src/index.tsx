import type { ToolbarPlugin } from '@stagewise/toolbar';
import { VueLogo } from './logo';
import {
  getSelectedElementAnnotation,
  getSelectedElementsPrompt,
} from './utils';

const VuePlugin: ToolbarPlugin = {
  displayName: 'Vue',
  description:
    'This plugin adds additional information and metadata for apps using Vue as an UI framework',
  iconSvg: <VueLogo />,
  pluginName: 'vue',
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
          promptContextName: 'elements-vue-component-info',
          content: content,
        },
      ],
    };
  },
};

export default VuePlugin;
