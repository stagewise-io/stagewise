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
  onPromptSend: (prompt) => ({
    contextSnippets: [
      {
        promptContextName: 'elements-vue-component-info',
        content: getSelectedElementsPrompt(prompt.contextElements),
      },
    ],
  }),
};
