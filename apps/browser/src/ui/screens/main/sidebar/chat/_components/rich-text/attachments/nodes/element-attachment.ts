import { createAttachmentNode } from '../base-attachment-node';
import type { ElementAttachmentAttrs } from '../types';
import { ElementAttachmentView } from './element-attachment-view';

/**
 * Element attachment node for selected DOM elements.
 * Uses a custom view that shows an element selector icon and
 * provides a preview card with element details on hover.
 *
 * Serialisation: when `blobPath` is set (after the `.swdomelement` blob has
 * been stored), `renderText` emits `[](path:<blobPath>)` so the model and
 * streamdown layer can locate the element data via the unified `path:`
 * protocol.  Before the blob is stored the node emits nothing — the user
 * can still see the badge in the editor, but the element won't appear in
 * the serialised text until the async store completes.
 */
export const ElementAttachment = createAttachmentNode<ElementAttachmentAttrs>({
  name: 'elementAttachment',
  dataTag: 'data-element-attachment',
  // The markdown protocol is used by the tokenizer to parse `[](path:...)`
  // links back into TipTap nodes when re-editing a sent message.  Element
  // attachments are stored as `att/*.swdomelement` blobs, so they share the
  // canonical `path:` protocol with regular file attachments.
  markdownProtocol: 'path',
  additionalAttributes: {
    innerText: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-inner-text'),
      renderHTML: (attributes) => ({
        'data-inner-text': attributes.innerText ?? null,
      }),
    },
    screenshotBlobKey: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-screenshot-blob-key'),
      renderHTML: (attributes) => ({
        'data-screenshot-blob-key': attributes.screenshotBlobKey ?? null,
      }),
    },
    tagName: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-tag-name'),
      renderHTML: (attributes) => ({
        'data-tag-name': attributes.tagName ?? null,
      }),
    },
    blobPath: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-blob-path'),
      renderHTML: (attributes) => ({
        'data-blob-path': attributes.blobPath ?? null,
      }),
    },
  },
  NodeView: ElementAttachmentView,
  renderText: ({ node }) => {
    const blobPath = node.attrs.blobPath as string | null | undefined;
    if (!blobPath) return '';
    return `[](path:${blobPath})`;
  },
});
