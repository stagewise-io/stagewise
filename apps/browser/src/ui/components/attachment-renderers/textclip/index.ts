import type { AttachmentRendererEntry } from '../types';
import { TextClipBadge } from './badge';

export const textclipRenderer: AttachmentRendererEntry = {
  id: 'textclip',
  mimePatterns: ['text/x-textclip'],
  Badge: TextClipBadge,
};
