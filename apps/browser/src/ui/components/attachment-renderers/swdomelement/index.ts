import type { AttachmentRendererEntry } from '../types';
import { SwDomElementBadge } from './badge';

export const swdomelementRenderer: AttachmentRendererEntry = {
  id: 'swdomelement',
  mimePatterns: ['application/x-swdomelement'],
  Badge: SwDomElementBadge,
};
