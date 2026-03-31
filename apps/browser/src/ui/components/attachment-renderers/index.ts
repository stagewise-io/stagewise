import type { AttachmentRendererEntry, ParamDescriptor } from './types';
import { buildMimeLookup } from '@ui/components/file-preview';
import { imageRenderer } from './image';
import { fallbackRenderer } from './fallback';
import { videoRenderer } from './video';
import { audioRenderer } from './audio';
import { pdfRenderer } from './pdf';
import { textclipRenderer } from './textclip';
import { swdomelementRenderer } from './swdomelement';

export type { RendererProps, BadgeProps, BadgeContext } from './types';
export type { AttachmentRendererEntry, ParamDescriptor } from './types';

/**
 * Resolves a mount-prefixed file path to a blob URL for rendering.
 *
 * - `att/<name>`         → `attachment://<agentId>/<name>`
 * - `<mount>/<relPath>`  → `workspace://<mount>/<relPath>`
 *
 * Returns an empty string when the path cannot be resolved (e.g. no agentId
 * for attachment paths or no slash in workspace paths).
 */
export function resolveAttachmentBlobUrl(
  path: string,
  agentId: string | null,
): string {
  if (path.startsWith('att/')) {
    const id = path.slice('att/'.length);
    return agentId ? `attachment://${agentId}/${id}` : '';
  }
  const slashIdx = path.indexOf('/');
  if (slashIdx <= 0) return '';
  const mountPrefix = path.slice(0, slashIdx);
  const relativePath = path.slice(slashIdx + 1);
  return `workspace://${mountPrefix}/${encodeURIComponent(relativePath)}`;
}

const renderers: AttachmentRendererEntry[] = [
  pdfRenderer,
  imageRenderer,
  videoRenderer,
  audioRenderer,
  textclipRenderer,
  swdomelementRenderer,
  fallbackRenderer,
];

export const getRenderer = buildMimeLookup(renderers, fallbackRenderer);

export function getAllParamDescriptors(): Array<{
  rendererId: string;
  params: ParamDescriptor[];
}> {
  return renderers
    .filter((r) => r.params && r.params.length > 0)
    .map((r) => ({ rendererId: r.id, params: r.params! }));
}
