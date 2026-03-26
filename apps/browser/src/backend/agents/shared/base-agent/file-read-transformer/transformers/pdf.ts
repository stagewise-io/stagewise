/**
 * PDF transformer.
 *
 * Extracts structured text and embedded images from each page using
 * `pdfjs-dist`. Text is returned as `<page>` XML elements with
 * `<text-content>` children. Embedded raster images are extracted from
 * the page operator list, encoded to WebP via `sharp`, and returned as
 * `ImagePart`s alongside the text.
 *
 * Falls back to a text-only error message when the PDF cannot be parsed.
 */

import sharp from 'sharp';
import type { TextPart, ImagePart } from 'ai';
import type {
  FileTransformer,
  FileTransformResult,
  ReadParams,
} from '../types';
import { baseMetadata } from '../format-utils';

// ---------------------------------------------------------------------------
// Limits — keep context-window usage bounded
// ---------------------------------------------------------------------------

/** Maximum number of pages to process. */
const MAX_PAGES = 30;

/** Maximum images to extract per page (skip after this). */
const MAX_IMAGES_PER_PAGE = 10;

/** Maximum total images across the entire document. */
const MAX_TOTAL_IMAGES = 50;

/** Minimum image dimension — skip tiny images (spacers, masks). */
const MIN_IMAGE_DIM = 10;

/** WebP quality for extracted images (lower than primary images). */
const WEBP_QUALITY = 60;

// ---------------------------------------------------------------------------
// Lazy-loaded pdfjs module
// ---------------------------------------------------------------------------

type PdfjsModule = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // Use the legacy build — no DOM/Canvas dependencies, Node.js safe.
      const pdfjs: PdfjsModule = await import(
        'pdfjs-dist/legacy/build/pdf.mjs'
      );

      // Point the worker to the bundled worker file.
      // In Node.js / Electron main process, pdfjs falls back to the main
      // thread if the worker cannot be loaded, which is acceptable here.
      try {
        const path = await import('node:path');
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        const pkgPath = require.resolve('pdfjs-dist/package.json');
        const workerPath = path.resolve(
          path.dirname(pkgPath),
          'legacy/build/pdf.worker.mjs',
        );
        pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
      } catch {
        // Swallow — pdfjs will use main-thread fallback.
      }

      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

// ---------------------------------------------------------------------------
// Image extraction helpers
// ---------------------------------------------------------------------------

interface ExtractedImage {
  webpBuffer: Buffer;
}

/**
 * Walk a page's operator list, find `paintImageXObject` ops, and
 * extract the referenced images as WebP buffers.
 */
async function extractPageImages(
  page: any,
  pdfjs: PdfjsModule,
  budget: { remaining: number },
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];

  try {
    const opList = await page.getOperatorList();

    // Collect unique image object IDs referenced by paintImageXObject ops.
    const seenIds = new Set<string>();
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (
        opList.fnArray[i] !== pdfjs.OPS.paintImageXObject &&
        opList.fnArray[i] !== pdfjs.OPS.paintImageXObjectRepeat
      ) {
        continue;
      }
      const imgId: string = opList.argsArray[i][0];
      if (seenIds.has(imgId)) continue;
      seenIds.add(imgId);

      if (images.length >= MAX_IMAGES_PER_PAGE || budget.remaining <= 0) break;

      try {
        const imgData = await resolveObj(page, imgId);
        if (!imgData || !imgData.data) continue;

        const { width, height, data, kind } = imgData as {
          width: number;
          height: number;
          data: Uint8ClampedArray;
          kind: number;
        };

        // Skip tiny images (spacers, masks, dots).
        if (width < MIN_IMAGE_DIM || height < MIN_IMAGE_DIM) continue;

        // Determine channel count from ImageKind.
        let channels: 1 | 3 | 4;
        if (kind === pdfjs.ImageKind.GRAYSCALE_1BPP) {
          channels = 1;
        } else if (kind === pdfjs.ImageKind.RGB_24BPP) {
          channels = 3;
        } else {
          // RGBA_32BPP or unknown — default to 4.
          channels = 4;
        }

        const webpBuf = await sharp(Buffer.from(data.buffer), {
          raw: { width, height, channels },
        })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();

        images.push({ webpBuffer: webpBuf });
        budget.remaining--;
      } catch {
        // Skip images that can't be decoded/converted.
      }
    }
  } catch {
    // getOperatorList can fail on malformed pages — return whatever we have.
  }

  return images;
}

/**
 * Resolve a page object by ID, wrapping the callback API in a Promise.
 * Returns `null` if the object doesn't exist or times out.
 */
function resolveObj(page: any, objId: string): Promise<any | null> {
  return new Promise((resolve) => {
    // Try synchronous get first (already resolved).
    try {
      const data = page.objs.get(objId);
      resolve(data);
      return;
    } catch {
      // Not resolved yet — fall through to callback form.
    }

    // Also check commonObjs (shared across pages).
    try {
      const data = page.commonObjs.get(objId);
      resolve(data);
      return;
    } catch {
      // Not there either.
    }

    // Use callback form with a timeout.
    const timer = setTimeout(() => resolve(null), 3000);

    try {
      page.objs.get(objId, (data: any) => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Text extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract text content from a page, preserving line breaks.
 */
async function extractPageText(page: any): Promise<string> {
  const content = await page.getTextContent();
  const lines: string[] = [];
  let currentLine = '';

  for (const item of content.items) {
    if (!('str' in item)) continue;

    currentLine += item.str;

    if (item.hasEOL) {
      lines.push(currentLine);
      currentLine = '';
    }
  }

  // Flush remaining text.
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Outline / bookmarks extraction
// ---------------------------------------------------------------------------

interface OutlineItem {
  /** Heading title. */
  title: string;
  /** Nesting depth (0 = top-level). */
  depth: number;
  /** Resolved 1-indexed page number (null if unresolvable). */
  pageNumber: number | null;
}

/**
 * Extract the document outline (bookmarks / table of contents) from a
 * PDF. Returns a flat list of outline items with resolved page numbers.
 *
 * Uses `pdf.getOutline()` which returns the PDF's bookmark tree, then
 * resolves each destination to a page number via `pdf.getPageIndex()`.
 */
async function extractOutline(pdf: any): Promise<OutlineItem[]> {
  const items: OutlineItem[] = [];

  try {
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) return items;

    async function walk(nodes: any[], depth: number): Promise<void> {
      for (const node of nodes) {
        let pageNumber: number | null = null;

        try {
          if (node.dest) {
            // dest can be a string (named dest) or an array.
            let dest = node.dest;
            if (typeof dest === 'string') {
              dest = await pdf.getDestination(dest);
            }
            if (Array.isArray(dest) && dest.length > 0) {
              const pageRef = dest[0];
              const pageIdx = await pdf.getPageIndex(pageRef);
              pageNumber = pageIdx + 1; // 0-indexed → 1-indexed
            }
          }
        } catch {
          // Destination resolution can fail — leave as null.
        }

        items.push({
          title: node.title ?? '(untitled)',
          depth,
          pageNumber,
        });

        if (node.items && node.items.length > 0) {
          await walk(node.items, depth + 1);
        }
      }
    }

    await walk(outline, 0);
  } catch {
    // Outline extraction is best-effort.
  }

  return items;
}

/**
 * Format outline items as a compact XML-like structure.
 */
function formatPdfOutline(items: OutlineItem[]): string {
  if (items.length === 0) return '';

  const lines = items.map((item) => {
    const indent = '  '.repeat(item.depth);
    const page = item.pageNumber !== null ? ` [page ${item.pageNumber}]` : '';
    return `${indent}- ${item.title}${page}`;
  });

  return `<outline>\n${lines.join('\n')}\n</outline>`;
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export const pdfTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
): Promise<FileTransformResult> => {
  const metadata: Record<string, string> = {
    ...baseMetadata(stats.size, stats.mtime),
    format: 'pdf',
  };

  if (buf.length === 0) {
    return {
      metadata: { ...metadata, error: 'empty' },
      parts: [{ type: 'text', text: 'Empty PDF file.' }],
    };
  }

  try {
    const pdfjs = await getPdfjs();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pagesToProcess = Math.min(numPages, MAX_PAGES);

    metadata.pages = String(numPages);
    if (pagesToProcess < numPages) {
      metadata.truncated = `${pagesToProcess}/${numPages}`;
    }

    // ── Extract document-level metadata ──────────────────────────────
    try {
      const { info } = await pdf.getMetadata();
      const i = info as Record<string, unknown>;
      if (i.Title && typeof i.Title === 'string') metadata.title = i.Title;
      if (i.Author && typeof i.Author === 'string') metadata.author = i.Author;
      if (i.Subject && typeof i.Subject === 'string')
        metadata.subject = i.Subject;
      if (i.Creator && typeof i.Creator === 'string')
        metadata.creator = i.Creator;
      if (i.Producer && typeof i.Producer === 'string')
        metadata.producer = i.Producer;
      if (i.PDFFormatVersion && typeof i.PDFFormatVersion === 'string')
        metadata.pdfVersion = i.PDFFormatVersion;
    } catch {
      // Metadata extraction is best-effort — skip on failure.
    }

    // ── Extract first-page dimensions for page format ────────────────
    try {
      const firstPage = await pdf.getPage(1);
      const vp = firstPage.getViewport({ scale: 1 });
      // Dimensions in PDF points (1 pt = 1/72 in).
      const wPt = Math.round(vp.width);
      const hPt = Math.round(vp.height);
      // Convert to approximate mm for readability.
      const wMm = Math.round(vp.width * 0.3528);
      const hMm = Math.round(vp.height * 0.3528);
      metadata.pageSize = `${wPt}×${hPt}pt (${wMm}×${hMm}mm)`;
      firstPage.cleanup();
    } catch {
      // Best-effort.
    }

    const { startPage, endPage, preview } = ctx.readParams;

    // ── Preview mode ──────────────────────────────────────────────
    // Return document outline (if available) + first-page text, no images.
    if (preview) {
      metadata.preview = 'true';

      const parts: (TextPart | ImagePart)[] = [];

      // Extract document outline / bookmarks.
      const outlineItems = await extractOutline(pdf);
      const outline = formatPdfOutline(outlineItems);

      const firstPage = await pdf.getPage(1);
      const firstText = await extractPageText(firstPage);
      firstPage.cleanup();

      let previewText = '';

      // Include outline before page content when available.
      if (outline) {
        previewText += `${outline}\n\n`;
      }

      previewText += `<page number="1">\n<text-content>\n`;
      previewText += firstText || '(no text content)';
      previewText += '\n</text-content>\n</page>';

      if (numPages > 1) {
        previewText += `\n… (${numPages - 1} more pages)`;
      }

      parts.push({ type: 'text', text: previewText });
      await pdf.destroy();

      const effectiveReadParams: ReadParams = {
        preview: true,
        startPage: 1,
        endPage: 1,
      };

      return { metadata, parts, effectiveReadParams };
    }

    // ── Page-range slicing ────────────────────────────────────────
    const firstPage = startPage !== undefined ? Math.max(1, startPage) : 1;
    const lastPage =
      endPage !== undefined
        ? Math.min(pagesToProcess, endPage)
        : pagesToProcess;

    const parts: (TextPart | ImagePart)[] = [];
    const imageBudget = { remaining: MAX_TOTAL_IMAGES };
    let totalImages = 0;

    for (let pageNum = firstPage; pageNum <= lastPage; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // 1. Extract text.
      const text = await extractPageText(page);

      // 2. Extract images.
      const images = await extractPageImages(page, pdfjs, imageBudget);
      totalImages += images.length;

      // 3. Build page XML.
      let pageXml = `<page number="${pageNum}">\n`;
      pageXml += '<text-content>\n';
      pageXml += text || '(no text content)';
      pageXml += '\n</text-content>';

      if (images.length > 0) {
        pageXml += `\n<images count="${images.length}">`;
        parts.push({ type: 'text', text: pageXml });

        for (const img of images) {
          parts.push({
            type: 'image',
            image: new Uint8Array(img.webpBuffer),
            mediaType: 'image/webp',
          });
        }

        parts.push({ type: 'text', text: '</images>\n</page>' });
      } else {
        pageXml += '\n</page>';
        parts.push({ type: 'text', text: pageXml });
      }

      page.cleanup();
    }

    await pdf.destroy();

    if (totalImages > 0) {
      metadata.images = String(totalImages);
    }

    // Build effectiveReadParams when a page range was applied.
    let effectiveReadParams: ReadParams | undefined;
    if (startPage !== undefined || endPage !== undefined) {
      effectiveReadParams = {
        startPage: firstPage,
        endPage: lastPage,
      };
    }

    return { metadata, parts, effectiveReadParams };
  } catch (err) {
    ctx.logger.warn(
      `[pdfTransformer] Failed to process ${mountedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );

    return {
      metadata: { ...metadata, error: 'parse-failed' },
      parts: [
        {
          type: 'text',
          text: `PDF could not be parsed. Use fs.readFile('${mountedPath}') in the sandbox to access raw bytes.`,
        },
      ],
    };
  }
};
