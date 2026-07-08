import { useMemo } from 'react';
import { IconChevronRight } from '@stagewise/icons';
import { Logo } from '@ui/components/ui/logo';
import { useKartonState } from '@ui/hooks/use-karton';

interface InternalPageBreadcrumbsProps {
  url: string;
}

type BreadcrumbSegment = {
  key: string;
  label: string;
};

// Format segment text: capitalize and split camelCase/kebab-case
function formatSegmentText(segment: string): string {
  // Split on hyphens (kebab-case) and camelCase boundaries
  // camelCase: split where lowercase is followed by uppercase
  const words: string[] = [];
  let currentWord = '';

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]!;
    const isUpperCase = char >= 'A' && char <= 'Z';
    const isHyphen = char === '-';

    if (isHyphen) {
      if (currentWord) {
        words.push(currentWord);
        currentWord = '';
      }
    } else if (isUpperCase && currentWord && i > 0) {
      // Found uppercase after lowercase - start new word
      words.push(currentWord);
      currentWord = char;
    } else {
      currentWord += char;
    }
  }

  if (currentWord) {
    words.push(currentWord);
  }

  // Capitalize first letter of each word and join with spaces
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function decodePreviewTitleParam(value: string | null): string | null {
  if (!value) return null;

  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function decodePathSegment(segment: string | undefined): string | null {
  if (!segment) return null;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function InternalPageBreadcrumbs({ url }: InternalPageBreadcrumbsProps) {
  const previewAgentId = useMemo(() => {
    try {
      const parsedUrl = new URL(url);
      if (
        parsedUrl.protocol !== 'stagewise:' ||
        parsedUrl.host !== 'internal' ||
        !parsedUrl.pathname.startsWith('/preview/')
      ) {
        return null;
      }
      return parsedUrl.searchParams.get('agentId');
    } catch {
      return null;
    }
  }, [url]);

  const previewAgentTitle = useKartonState((s) =>
    previewAgentId
      ? (s.agents.instances[previewAgentId]?.state.title ?? null)
      : null,
  );

  const breadcrumbSegments = useMemo<BreadcrumbSegment[]>(() => {
    try {
      const parsedUrl = new URL(url);
      const pathnameSegments = parsedUrl.pathname
        .split('/')
        .filter((segment) => segment.length > 0);

      if (
        parsedUrl.protocol === 'stagewise:' &&
        parsedUrl.host === 'internal' &&
        pathnameSegments[0] === 'preview'
      ) {
        const appId = decodePathSegment(pathnameSegments[1]);
        const previewTitle =
          decodePreviewTitleParam(parsedUrl.searchParams.get('title')) ??
          (appId ? formatSegmentText(appId) : null);
        const pluginId = parsedUrl.searchParams.get('pluginId');
        const ownerLabel =
          previewAgentTitle ?? (pluginId ? formatSegmentText(pluginId) : null);

        return [
          { key: 'preview', label: 'Preview' },
          ...(ownerLabel
            ? [{ key: `owner-${ownerLabel}`, label: ownerLabel }]
            : []),
          ...(previewTitle
            ? [{ key: `app-${appId ?? previewTitle}`, label: previewTitle }]
            : []),
        ];
      }

      return pathnameSegments.map((segment, index) => ({
        key: pathnameSegments.slice(0, index + 1).join('/'),
        label: formatSegmentText(segment),
      }));
    } catch {
      return [];
    }
  }, [url, previewAgentTitle]);

  return (
    <div className="pointer-events-none absolute inset-0 flex size-full flex-row items-center gap-1.5 overflow-hidden px-1">
      <div className="flex h-6 shrink-0 items-center justify-center gap-1 rounded-full bg-primary-solid/10 px-2 py-0.5">
        <Logo className="size-3 text-primary-foreground" color="current" />
        <span className="font-medium text-primary-foreground text-xs">
          stagewise
        </span>
      </div>
      {breadcrumbSegments.length > 0 ? (
        breadcrumbSegments.map((segment, index) => {
          const isLast = index === breadcrumbSegments.length - 1;
          return (
            <div
              key={segment.key}
              className={`flex min-w-0 flex-row items-center gap-1.5 ${isLast ? '' : 'shrink-0'}`}
            >
              <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
              <span
                className={`text-foreground text-sm ${isLast ? 'truncate' : ''}`}
              >
                {segment.label}
              </span>
            </div>
          );
        })
      ) : (
        <div className="flex shrink-0 flex-row items-center gap-1.5">
          <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
          <span className="text-foreground text-sm">Home</span>
        </div>
      )}
    </div>
  );
}
