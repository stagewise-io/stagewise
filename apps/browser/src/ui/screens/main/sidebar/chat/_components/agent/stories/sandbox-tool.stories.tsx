import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  createUserMessage,
  createAssistantMessageWithText as createAssistantMessage,
  createReasoningPart as createThinkingPart,
  createExecuteSandboxJsToolPart,
  createDefaultAgentState,
} from '@sb/decorators/scenarios/shared-utilities';

const createStoryState = (
  messages: AgentMessage[],
  options?: { isWorking?: boolean },
) =>
  createDefaultAgentState(
    {
      initialHistory: messages,
      isWorking: options?.isWorking,
    },
    {
      userExperience: {
        storedExperienceData: {
          recentlyOpenedWorkspaces: [],
          hasSeenOnboardingFlow: false,
          lastViewedChats: {},
        },
        pendingOnboardingSuggestion: null,
        devAppPreview: {
          isFullScreen: false,
          inShowCodeMode: false,
          customScreenSize: null,
        },
      },
    },
  );

const meta: Meta<typeof ChatHistory> = {
  title: 'Agent/Sandbox Tool',
  component: ChatHistory,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', minHeight: '400px' }}>
        <Story />
      </div>
    ),
    withMockKarton,
  ],
};

export default meta;
type Story = StoryObj<typeof ChatHistory>;

/**
 * Sandbox Basic JSON Result
 *
 * A completed sandbox script that queries computed styles from a DOM element
 * and returns a JSON result.
 */
export const SandboxBasicJsonResult: Story = {
  name: 'Sandbox/Basic-JSON-Result',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('What font is the heading using?'),
      createAssistantMessage(
        'Let me inspect the heading element to check its computed font styles.',
        {
          thinkingPart: createThinkingPart(
            'I need to query the computed styles of the heading element to find the font family...',
            'done',
          ),
          toolParts: [
            createExecuteSandboxJsToolPart(
              `const result = await API.sendCDP("t_1", "CSS.getComputedStyleForNode", {
  nodeId: 42
});
const fontProps = result.computedStyle.filter(
  p => p.name.startsWith("font-")
);
return JSON.stringify(fontProps);`,
              'output-available',
              {
                result: JSON.stringify([
                  { name: 'font-family', value: '"Inter", sans-serif' },
                  { name: 'font-size', value: '32px' },
                  { name: 'font-weight', value: '700' },
                  { name: 'font-style', value: 'normal' },
                  { name: 'font-style', value: 'normal' },
                  { name: 'font-style', value: 'normal' },
                  { name: 'font-style', value: 'normal' },
                  { name: 'font-style', value: 'normal' },
                ]),
              },
            ),
          ],
        },
      ),
      createAssistantMessage(
        'The heading is using **Inter** (with sans-serif fallback) at **32px** bold (weight 700). This is a clean, modern sans-serif typeface commonly used in web applications.',
      ),
    ]),
  },
};

/**
 * Sandbox Streaming
 *
 * Shows a sandbox script in streaming state with the loading spinner.
 */
export const SandboxStreaming: Story = {
  name: 'Sandbox/Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Get the HTML of the navigation bar'),
      createAssistantMessage('Let me extract the navigation HTML for you.', {
        thinkingPart: createThinkingPart(
          'I will use DOM.getOuterHTML to get the navigation element...',
          'done',
        ),
        toolParts: [
          createExecuteSandboxJsToolPart(
            `const doc = await API.sendCDP("t_1", "DOM.getDocument", {});
const nav = await API.sendCDP("t_1", "DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: "nav"
});
const html = await API.sendCDP("t_1", "DOM.getOuterHTML", {
  nodeId: nav.nodeId
});
return html.outerHTML;`,
            'input-streaming',
          ),
        ],
      }),
    ]),
  },
};

/**
 * Sandbox Error
 *
 * Shows a sandbox script that failed with a runtime error.
 */
export const SandboxError: Story = {
  name: 'Sandbox/Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Query the login form styles'),
      createAssistantMessage('Let me inspect the login form styles.', {
        thinkingPart: createThinkingPart(
          'I will query the CSS styles of the login form element...',
          'done',
        ),
        toolParts: [
          createExecuteSandboxJsToolPart(
            `const doc = await API.sendCDP("t_1", "DOM.getDocument", {});
const form = await API.sendCDP("t_1", "DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: "#login-form"
});
const styles = await API.sendCDP("t_1", "CSS.getMatchedStylesForNode", {
  nodeId: form.nodeId
});
return styles;`,
            'output-error',
            {
              errorText: `Error: No node with given id found
    at Object.sendCDP (sandbox-worker.ts:82:15)
    at Script.execute (<sandbox>:5:26)

The element "#login-form" was not found in the current document.
Make sure the selector is correct and the element exists on the page.`,
            },
          ),
        ],
      }),
      createAssistantMessage(
        "I encountered an error: the `#login-form` element doesn't exist on the current page. This could mean:\n\n1. The login form uses a different selector\n2. You might not be on the login page\n\nWould you like me to search for form elements on the current page instead?",
      ),
    ]),
  },
};

/**
 * Sandbox With 2 Image Attachments
 *
 * Script that uses API.createAttachment() twice to produce two PNG screenshots.
 * The script uses API.createAttachment() to produce two PNG screenshots.
 */
export const SandboxWith2ImageAttachments: Story = {
  name: 'Sandbox/With-2-Image-Attachments',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Take screenshots of the header and footer sections'),
      createAssistantMessage(
        'I will capture screenshots of both sections for analysis.',
        {
          thinkingPart: createThinkingPart(
            'I need to take individual screenshots of the header and footer using Page.captureScreenshot with clip regions...',
            'done',
          ),
          toolParts: [
            createExecuteSandboxJsToolPart(
              `const headerScreenshot = await API.sendCDP("t_1", "Page.captureScreenshot", {
  format: "png",
  clip: { x: 0, y: 0, width: 1280, height: 80, scale: 1 }
});
API.createAttachment({
  id: "header-screenshot",
  mediaType: "image/png",
  fileName: "header.png",
  url: "data:image/png;base64," + headerScreenshot.data
});

const footerScreenshot = await API.sendCDP("t_1", "Page.captureScreenshot", {
  format: "png",
  clip: { x: 0, y: 900, width: 1280, height: 120, scale: 1 }
});
API.createAttachment({
  id: "footer-screenshot",
  mediaType: "image/png",
  fileName: "footer.png",
  url: "data:image/png;base64," + footerScreenshot.data
});

return JSON.stringify({ headerCaptured: true, footerCaptured: true });`,
              'output-available',
              {
                result: JSON.stringify({
                  headerCaptured: true,
                  footerCaptured: true,
                }),
              },
            ),
          ],
        },
      ),
      createAssistantMessage(
        "I've captured screenshots of both sections:\n\n1. **Header** (1280x80) - Shows the navigation bar with logo and menu items\n2. **Footer** (1280x120) - Shows the footer with links and copyright\n\nBoth images have been attached for your reference. Would you like me to analyze the layout or suggest changes?",
      ),
    ]),
  },
};

/**
 * Sandbox With 3 Mixed Attachments
 *
 * Script with 3 createAttachment calls producing mixed media types:
 * a PNG screenshot, an SVG diagram, and an HTML snippet.
 * Tests the "Parsed 3 attachments" label in the exploring summary.
 */
export const SandboxWith3MixedAttachments: Story = {
  name: 'Sandbox/With-3-Mixed-Attachments',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Capture the hero section layout info, including a screenshot, the SVG logo, and the raw HTML',
      ),
      createAssistantMessage(
        'I will extract the hero section layout in multiple formats.',
        {
          thinkingPart: createThinkingPart(
            'I need to capture a screenshot, extract the SVG logo, and get the raw HTML of the hero section...',
            'done',
          ),
          toolParts: [
            createExecuteSandboxJsToolPart(
              `const screenshot = await API.sendCDP("t_1", "Page.captureScreenshot", {
  format: "png",
  clip: { x: 0, y: 0, width: 1280, height: 600, scale: 1 }
});
API.createAttachment({
  id: "hero-screenshot",
  mediaType: "image/png",
  fileName: "hero-section.png",
  url: "data:image/png;base64," + screenshot.data
});

const doc = await API.sendCDP("t_1", "DOM.getDocument", {});
const svgNode = await API.sendCDP("t_1", "DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: ".hero-logo svg"
});
const svgHtml = await API.sendCDP("t_1", "DOM.getOuterHTML", {
  nodeId: svgNode.nodeId
});
const svgB64 = Buffer.from(svgHtml.outerHTML).toString("base64");
API.createAttachment({
  id: "hero-logo-svg",
  mediaType: "image/svg+xml",
  fileName: "hero-logo.svg",
  url: "data:image/svg+xml;base64," + svgB64
});

const heroNode = await API.sendCDP("t_1", "DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: ".hero-section"
});
const heroHtml = await API.sendCDP("t_1", "DOM.getOuterHTML", {
  nodeId: heroNode.nodeId
});
const htmlB64 = Buffer.from(heroHtml.outerHTML).toString("base64");
API.createAttachment({
  id: "hero-html",
  mediaType: "text/html",
  fileName: "hero-section.html",
  url: "data:text/html;base64," + htmlB64
});

return JSON.stringify({
  screenshotSize: "1280x600",
  svgFound: true,
  htmlLength: heroHtml.outerHTML.length
});`,
              'output-available',
              {
                result: JSON.stringify({
                  screenshotSize: '1280x600',
                  svgFound: true,
                  htmlLength: 2847,
                }),
              },
            ),
          ],
        },
      ),
      createAssistantMessage(
        "I've captured the hero section in three formats:\n\n1. **Screenshot** (PNG, 1280x600) - Visual capture of the full hero area\n2. **Logo** (SVG) - The vector logo extracted from `.hero-logo svg`\n3. **HTML** (2,847 chars) - Raw markup of `.hero-section`\n\nAll three attachments are available for analysis. The hero section uses a standard flex layout with the logo centered above the heading text.",
      ),
    ]),
  },
};

/**
 * Sandbox Attachments Mixed Types
 *
 * Script with 2 createAttachment calls with different media types.
 * Tests how the UI handles mixed attachment types.
 */
export const SandboxAttachmentsWithValidationError: Story = {
  name: 'Sandbox/Attachments-Mixed-Types',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Capture the page screenshot and export the video element',
      ),
      createAssistantMessage(
        'I will capture the screenshot and try to extract the video element.',
        {
          thinkingPart: createThinkingPart(
            'I need to take a screenshot and extract the video source...',
            'done',
          ),
          toolParts: [
            createExecuteSandboxJsToolPart(
              `const screenshot = await API.sendCDP("t_1", "Page.captureScreenshot", {
  format: "png"
});
API.createAttachment({
  id: "page-screenshot",
  mediaType: "image/png",
  fileName: "page.png",
  url: "data:image/png;base64," + screenshot.data
});

const doc = await API.sendCDP("t_1", "DOM.getDocument", {});
const video = await API.sendCDP("t_1", "DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: "video source"
});
const videoSrc = await API.sendCDP("t_1", "Runtime.evaluate", {
  expression: "document.querySelector('video source').src"
});
API.createAttachment({
  id: "video-source",
  mediaType: "video/mp4",
  fileName: "background-video.mp4",
  url: videoSrc.result.value
});

return JSON.stringify({ screenshotCaptured: true, videoExtracted: true });`,
              'output-available',
              {
                result: JSON.stringify({
                  screenshotCaptured: true,
                  videoExtracted: true,
                }),
              },
            ),
          ],
        },
      ),
      createAssistantMessage(
        "I captured the page screenshot successfully, but the video extraction encountered a limitation:\n\n1. **Screenshot** (PNG) - Captured successfully\n2. **Video** (MP4) - Could not be attached; video files are not supported as attachments. Only image formats are accepted.\n\nI can see the screenshot for analysis. Would you like me to describe the video element's layout or styles instead?",
      ),
    ]),
  },
};
