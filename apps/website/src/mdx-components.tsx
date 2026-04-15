import { cn } from '@/lib/utils';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    img: ({ className, alt, ...props }) => (
      // biome-ignore lint/performance/noImgElement: MDX article images come from static public assets and need plain responsive rendering
      <img
        alt={alt ?? ''}
        className={cn(
          'mx-auto my-8 block h-auto w-full max-w-[36rem] rounded-xl border-2 border-derived-subtle shadow-sm',
          className,
        )}
        {...props}
      />
    ),
    ...components,
  };
}
