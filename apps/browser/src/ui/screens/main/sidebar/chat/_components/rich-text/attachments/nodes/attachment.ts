import { createAttachmentNode } from '../base-attachment-node';
import { AttachmentRegistryNodeView } from './attachment-view';

export const Attachment = createAttachmentNode({
  name: 'attachment',
  dataTag: 'data-attachment',
  markdownProtocol: 'path',
  NodeView: AttachmentRegistryNodeView,
  renderText: ({ node }) => {
    // attrs.id is the full path (att/<name>). Serialize back to path: protocol
    // directly — getAttachmentAnchorText would double-prefix att/.
    return `[](path:${node.attrs.id})`;
  },
  // The canonical path: protocol encodes att/<id> as the value.
  // Keep the full path (including att/ prefix) so attrs.id matches
  // Attachment.path for lookups in attachment-view.
  parseMarkdown: (token: any) => {
    const raw: string = token.id ?? '';
    // Strip query params (e.g. ?display=expanded) from the id
    const qIdx = raw.indexOf('?');
    const cleanId = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    return {
      type: 'attachment',
      attrs: { id: cleanId, label: cleanId.split('/').pop() ?? cleanId },
    };
  },
  // Serialize back using path: protocol with the full path (att/<name>)
  renderMarkdown: (node: any) => {
    return `[](path:${node.attrs.id})`;
  },
});
