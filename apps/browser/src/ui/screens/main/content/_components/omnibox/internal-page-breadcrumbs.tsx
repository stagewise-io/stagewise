import { useMemo } from 'react';
import { IconChevronRight } from 'nucleo-micro-bold';
import { Logo } from '@/components/ui/logo';

interface InternalPageBreadcrumbsProps {
  url: string;
  onFocusInput: () => void;
}

// Format segment text: capitalize and split camelCase/kebab-case
function formatSegmentText(segment: string): string {
  // Split on hyphens (kebab-case) and camelCase boundaries
  // camelCase: split where lowercase is followed by uppercase
  const words: string[] = [];
  let currentWord = '';

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
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

export function InternalPageBreadcrumbs({
  url,
  onFocusInput,
}: InternalPageBreadcrumbsProps) {
  // Parse pathname segments from stagewise://internal/ URL
  const pathnameSegments = useMemo(() => {
    try {
      // Extract pathname from stagewise://internal/path/to/resource
      const pathname = url.replace('stagewise://internal', '').split('?')[0];
      // Split by '/' and filter out empty segments
      return pathname.split('/').filter((segment) => segment.length > 0);
    } catch {
      return [];
    }
  }, [url]);

  return (
    <div
      onClick={onFocusInput}
      className="-ml-2 flex h-8 w-full cursor-pointer flex-row items-center gap-1.5 overflow-hidden"
    >
      <div className="flex h-6 shrink-0 items-center justify-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
        <Logo className="size-3 text-primary-foreground" color="current" />
        <span className="font-medium text-primary-foreground text-xs">
          stagewise
        </span>
      </div>
      {pathnameSegments.length > 0 ? (
        pathnameSegments.map((segment, index) => {
          // Create a unique key using the path prefix up to this segment
          const pathPrefix = pathnameSegments.slice(0, index + 1).join('/');
          const isLast = index === pathnameSegments.length - 1;
          return (
            <div
              key={pathPrefix}
              className={`flex min-w-0 flex-row items-center gap-1.5 ${isLast ? '' : 'shrink-0'}`}
            >
              <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
              <span
                className={`text-foreground text-sm ${isLast ? 'truncate' : ''}`}
              >
                {formatSegmentText(segment)}
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
