import type { TabState } from '@shared/karton-contracts/ui';
import { getBaseName } from '@shared/path-utils';

/**
 * Represents a parsed CDP call extracted from a sandbox script.
 */
export interface ParsedCDPCall {
  tabId: string;
  method: string;
}

/**
 * Represents a parsed writeFile call extracted from a sandbox script.
 */
export interface ParsedWriteFileCall {
  relativePath: string;
}

/**
 * Represents a parsed attachment read via `fs.readFile('att/...')`.
 */
export interface ParsedReadAttachmentCall {
  attachmentId: string;
}

/**
 * Indicates an outputAttachment call was found in a sandbox script,
 * optionally with its mediaType extracted.
 */
export interface ParsedMultimodalAttachmentCall {
  found: true;
  mediaType?: string;
}

/**
 * Human-readable labels for common CDP methods.
 * Each method maps to in-progress/completed labels and a preposition for the hostname.
 * - "from" for data retrieval (read, got, extracted)
 * - "on" for actions/interactions (queried, called, ran)
 */
const CDP_METHOD_LABELS: Record<
  string,
  { inProgress: string; completed: string; preposition: 'on' | 'from' | 'of' }
> = {
  // CSS domain
  'CSS.enable': {
    inProgress: 'Enabling CSS inspection',
    completed: 'Enabled CSS inspection',
    preposition: 'on',
  },
  'CSS.getComputedStyleForNode': {
    inProgress: 'Reading computed styles',
    completed: 'Read computed styles',
    preposition: 'from',
  },
  'CSS.getMatchedStylesForNode': {
    inProgress: 'Reading CSS rules',
    completed: 'Read CSS rules',
    preposition: 'from',
  },
  'CSS.getInlineStylesForNode': {
    inProgress: 'Reading inline styles',
    completed: 'Read inline styles',
    preposition: 'from',
  },
  'CSS.getStyleSheetText': {
    inProgress: 'Reading stylesheet',
    completed: 'Read stylesheet',
    preposition: 'from',
  },

  // DOM domain
  'DOM.enable': {
    inProgress: 'Enabling DOM inspection',
    completed: 'Enabled DOM inspection',
    preposition: 'on',
  },
  'DOM.getDocument': {
    inProgress: 'Reading document',
    completed: 'Read document',
    preposition: 'from',
  },
  'DOM.querySelector': {
    inProgress: 'Querying element',
    completed: 'Queried element',
    preposition: 'on',
  },
  'DOM.querySelectorAll': {
    inProgress: 'Querying elements',
    completed: 'Queried elements',
    preposition: 'on',
  },
  'DOM.getOuterHTML': {
    inProgress: 'Reading element HTML',
    completed: 'Read element HTML',
    preposition: 'from',
  },
  'DOM.resolveNode': {
    inProgress: 'Resolving element',
    completed: 'Resolved element',
    preposition: 'on',
  },
  'DOM.getBoxModel': {
    inProgress: 'Reading box model',
    completed: 'Read box model',
    preposition: 'from',
  },

  // Runtime domain
  'Runtime.enable': {
    inProgress: 'Enabling runtime',
    completed: 'Enabled runtime',
    preposition: 'on',
  },
  'Runtime.evaluate': {
    inProgress: 'Running a script',
    completed: 'Ran a script',
    preposition: 'on',
  },
  'Runtime.callFunctionOn': {
    inProgress: 'Calling function',
    completed: 'Called function',
    preposition: 'on',
  },
  'Runtime.getProperties': {
    inProgress: 'Reading properties',
    completed: 'Read properties',
    preposition: 'from',
  },

  // Page domain
  'Page.enable': {
    inProgress: 'Enabling page inspection',
    completed: 'Enabled page inspection',
    preposition: 'on',
  },
  'Page.getFrameTree': {
    inProgress: 'Reading frames',
    completed: 'Read frames',
    preposition: 'from',
  },
  'Page.captureScreenshot': {
    inProgress: 'Taking screenshot',
    completed: 'Took screenshot',
    preposition: 'of',
  },

  // Network domain
  'Network.enable': {
    inProgress: 'Enabling network inspection',
    completed: 'Enabled network inspection',
    preposition: 'on',
  },
  'Network.getResponseBody': {
    inProgress: 'Reading response',
    completed: 'Read response',
    preposition: 'from',
  },
};

/**
 * Parses a sandbox script to extract CDP calls.
 * Matches patterns like: API.sendCDP("t_1", "CSS.getComputedStyleForNode", ...)
 */
export function parseCDPCalls(script: string): ParsedCDPCall[] {
  // Regex to match API.sendCDP("tabId", "Method.name", ...)
  // Supports both single and double quotes
  const regex = /API\.sendCDP\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g;
  const calls: ParsedCDPCall[] = [];

  let match = regex.exec(script);
  while (match !== null) {
    calls.push({
      tabId: match[1]!,
      method: match[2]!,
    });
    match = regex.exec(script);
  }

  return calls;
}

/**
 * Parses a sandbox script to extract writeFile calls.
 * Matches fs.writeFile, fs.writeFileSync, fsp.writeFile, and legacy API.writeFile.
 */
export function parseWriteFileCalls(script: string): ParsedWriteFileCall[] {
  const regex =
    /(?:API\.writeFile|fs\.writeFile(?:Sync)?|fsp\.writeFile)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const calls: ParsedWriteFileCall[] = [];

  let match = regex.exec(script);
  while (match !== null) {
    calls.push({
      relativePath: match[1]!,
    });
    match = regex.exec(script);
  }

  return calls;
}

/**
 * Parses a sandbox script to extract attachment reads via `fs.readFile('att/...')`.
 * Matches patterns like: fs.readFile('att/abc123'), fsp.readFile("att/abc123")
 */
export function parseReadAttachmentCalls(
  script: string,
): ParsedReadAttachmentCall[] {
  const regex = /(?:fs|fsp)\.readFile\s*\(\s*["'`]att\/([^"'`]+)["'`]/g;
  const calls: ParsedReadAttachmentCall[] = [];

  let match = regex.exec(script);
  while (match !== null) {
    calls.push({ attachmentId: match[1]! });
    match = regex.exec(script);
  }

  return calls;
}

/**
 * Parses a sandbox script to extract outputAttachment calls.
 * Matches patterns like: API.outputAttachment({...})
 */
export function parseOutputAttachmentCalls(
  script: string,
): ParsedMultimodalAttachmentCall[] {
  const regex =
    /API\.outputAttachment\s*\(\s*\{[^}]*mediaType\s*:\s*["']([^"']+)["'][^}]*\}/g;
  const calls: ParsedMultimodalAttachmentCall[] = [];

  let match = regex.exec(script);
  while (match !== null) {
    calls.push({ found: true, mediaType: match[1] });
    match = regex.exec(script);
  }

  if (calls.length > 0) return calls;

  // Fallback: count calls without extracting mediaType
  const fallbackRegex = /API\.outputAttachment\s*\(/g;
  while (fallbackRegex.exec(script) !== null) calls.push({ found: true });

  return calls;
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  'application/pdf': 'PDF',
  'text/html': 'HTML',
  'text/csv': 'CSV',
  'application/json': 'JSON',
};

/**
 * Derives a human-friendly noun from a MIME mediaType.
 * Falls back to "attachment" for unknown types.
 */
export function getAttachmentLabel(mediaType: string | undefined): string {
  if (!mediaType) return 'attachment';
  if (MEDIA_TYPE_LABELS[mediaType]) return MEDIA_TYPE_LABELS[mediaType];
  const topLevel = mediaType.split('/')[0];
  if (topLevel && MEDIA_TYPE_LABELS[topLevel])
    return MEDIA_TYPE_LABELS[topLevel];
  return 'attachment';
}

/**
 * Gets the filename from a path (last segment after /).
 */
function getFileName(relativePath: string): string {
  return getBaseName(relativePath) || relativePath;
}

interface MethodLabelResult {
  label: string;
  preposition: 'on' | 'from' | 'of';
}

/**
 * Gets a human-readable label and preposition for a CDP method.
 * Falls back to a generic label based on the domain if the method is unknown.
 */
export function getMethodLabel(
  method: string,
  isInProgress: boolean,
): MethodLabelResult {
  const labels = CDP_METHOD_LABELS[method];
  if (labels)
    return {
      label: isInProgress ? labels.inProgress : labels.completed,
      preposition: labels.preposition,
    };

  // Fallback: extract domain and create generic label
  // e.g., "CSS.someUnknownMethod" → "Inspecting CSS" / "Inspected CSS"
  const domain = method.split('.')[0];
  if (domain) {
    return {
      label: isInProgress ? `Inspecting ${domain}` : `Inspected ${domain}`,
      preposition: 'on',
    };
  }

  return {
    label: isInProgress ? 'Running script' : 'Ran script',
    preposition: 'on',
  };
}

/**
 * Resolves a tab ID to its hostname.
 * Returns undefined if the tab is not found or URL parsing fails.
 */
export function resolveTabHostname(
  tabId: string,
  activeTabs: Record<string, TabState>,
): string | undefined {
  const tab = activeTabs[tabId];
  if (!tab) return undefined;

  try {
    return new URL(tab.url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Generates a contextual label for a sandbox script based on its CDP calls,
 * file writes, and attachment reads (via `fs.readFile('att/...')`).
 *
 * @param script - The sandbox script content
 * @param activeTabs - Current browser tabs from state
 * @param isInProgress - Whether the script is still running
 * @returns A human-readable label describing the operation
 */
export function getSandboxLabel(
  script: string | undefined,
  activeTabs: Record<string, TabState>,
  isInProgress: boolean,
): string {
  if (!script) return isInProgress ? 'Running a script...' : 'Ran a script';

  const cdpCalls = parseCDPCalls(script);
  const writeFileCalls = parseWriteFileCalls(script);
  const readAttCalls = parseReadAttachmentCalls(script);
  const multimodalAttachmentCalls = parseOutputAttachmentCalls(script);

  const attWriteCalls = writeFileCalls.filter((c) =>
    c.relativePath.startsWith('att/'),
  );
  const realWriteCalls = writeFileCalls.filter(
    (c) => !c.relativePath.startsWith('att/'),
  );

  // No API calls found
  if (
    cdpCalls.length === 0 &&
    writeFileCalls.length === 0 &&
    readAttCalls.length === 0 &&
    multimodalAttachmentCalls.length === 0
  )
    return isInProgress ? 'Running a script...' : 'Ran a script';

  // 1. API.outputAttachment always wins (user sees visual output)
  if (multimodalAttachmentCalls.length > 0) {
    const label = getAttachmentLabel(multimodalAttachmentCalls[0]!.mediaType);
    const allSameType = multimodalAttachmentCalls.every(
      (c) => getAttachmentLabel(c?.mediaType) === label,
    );

    if (multimodalAttachmentCalls.length === 1)
      return isInProgress ? `Parsing ${label}...` : `Parsed ${label}`;

    const noun = allSameType ? `${label}s` : 'attachments';
    return isInProgress
      ? `Parsing ${multimodalAttachmentCalls.length} ${noun}...`
      : `Parsed ${multimodalAttachmentCalls.length} ${noun}`;
  }

  // 2. att/ writes only (preparing data for visual output)
  if (
    attWriteCalls.length > 0 &&
    realWriteCalls.length === 0 &&
    cdpCalls.length === 0 &&
    readAttCalls.length === 0
  ) {
    if (attWriteCalls.length === 1)
      return isInProgress ? 'Preparing attachment...' : 'Prepared attachment';

    return isInProgress
      ? `Preparing ${attWriteCalls.length} attachments...`
      : `Prepared ${attWriteCalls.length} attachments`;
  }

  // 3. Attachment reads only
  if (
    cdpCalls.length === 0 &&
    realWriteCalls.length === 0 &&
    attWriteCalls.length === 0 &&
    readAttCalls.length > 0
  ) {
    if (readAttCalls.length === 1)
      return isInProgress ? 'Reading attachment...' : 'Read attachment';

    return isInProgress
      ? `Reading ${readAttCalls.length} attachments...`
      : `Read ${readAttCalls.length} attachments`;
  }

  // 4. Real file writes (possibly with attachment reads), no CDP calls
  if (cdpCalls.length === 0 && realWriteCalls.length > 0) {
    const attachmentSuffix =
      readAttCalls.length > 0
        ? ` from ${readAttCalls.length === 1 ? 'attachment' : `${readAttCalls.length} attachments`}`
        : '';

    if (realWriteCalls.length === 1) {
      const fileName = getFileName(realWriteCalls[0]!.relativePath);
      return isInProgress
        ? `Writing ${fileName}${attachmentSuffix}...`
        : `Wrote ${fileName}${attachmentSuffix}`;
    }
    return isInProgress
      ? `Writing ${realWriteCalls.length} files${attachmentSuffix}...`
      : `Wrote ${realWriteCalls.length} files${attachmentSuffix}`;
  }

  // 5. CDP calls
  const uniqueTabIds = Array.from(new Set(cdpCalls.map((c) => c.tabId)));

  if (uniqueTabIds.length > 1)
    return isInProgress
      ? `Running a script on ${uniqueTabIds.length} tabs...`
      : `Ran a script on ${uniqueTabIds.length} tabs`;

  const hostname = resolveTabHostname(uniqueTabIds[0]!, activeTabs);
  const latestMethod = cdpCalls[cdpCalls.length - 1]!.method;
  const { label, preposition } = getMethodLabel(latestMethod, isInProgress);
  const suffix = hostname ? ` ${preposition} ${hostname}` : '';

  if (realWriteCalls.length > 0) {
    const fileInfo =
      realWriteCalls.length === 1
        ? getFileName(realWriteCalls[0]!.relativePath)
        : `${realWriteCalls.length} files`;
    if (isInProgress) return `${label}${suffix}, writing ${fileInfo}...`;
    return `${label}${suffix}, wrote ${fileInfo}`;
  }

  if (isInProgress) return `${label}${suffix}...`;

  return `${label}${suffix}`;
}
