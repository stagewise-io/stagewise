import type { FC, HTMLAttributes } from 'react';
import { cn } from '@/utils';
import { Logo } from '@stagewise/stage-ui/components/logo';
import { LogoText } from '@stagewise/stage-ui/components/logo-text';

export interface LogoWithTextProps extends HTMLAttributes<HTMLDivElement> {
  textClassName?: string;
}

/**
 * stagewise logo with text.
 * Combines the Logo SVG component with the LogoText SVG component.
 * The colors use design system defaults (primary for logo, foreground for text).
 */
export const LogoWithText: FC<LogoWithTextProps> = ({
  className,
  textClassName,
  ...props
}) => {
  return (
    <div className={cn('flex h-10 items-center gap-2', className)} {...props}>
      <Logo className="h-full w-auto" />
      <LogoText className={cn('h-[60%] w-auto fill-current', textClassName)} />
    </div>
  );
};
