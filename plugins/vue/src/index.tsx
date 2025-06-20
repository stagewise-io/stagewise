import type { ToolbarPlugin } from '@stagewise/toolbar';
import { VueLogo } from './logo';
import {
  getSelectedElementAnnotation,
  getSelectedElementsPrompt,
} from './utils';

export const VuePlugin: ToolbarPlugin = {
  displayName: 'Vue',
  description:
    'This toolbar adds additional information and metadata for apps using Vue as an UI framework',
  iconSvg: <VueLogo />,
  pluginName: 'vue',
  onContextElementHover: getSelectedElementAnnotation,
  onContextElementSelect: getSelectedElementAnnotation,
  onPromptSend: (prompt) => {
    const content = getSelectedElementsPrompt(prompt.contextElements);

    // contentがnullの場合は空配列を返す
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
