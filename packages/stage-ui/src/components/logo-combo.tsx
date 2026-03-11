import type { FC, HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { Logo } from './logo';
import { LogoText } from './logo-text';

export interface LogoComboProps extends HTMLAttributes<HTMLDivElement> {
  /** className applied to the logo SVG paths */
  logoClassName?: string;
  /** className applied to the logo-text SVG path */
  textClassName?: string;
  /** Height of the logo icon in px. Defaults to 32. */
  size?: number;
}

export const LogoCombo: FC<LogoComboProps> = ({
  className,
  logoClassName,
  textClassName,
  size = 32,
  style,
  ...props
}) => {
  const textHeight = size * 0.9;
  const gap = size * 0.4;

  return (
    <div
      className={cn('flex shrink-0 items-center', className)}
      style={{ gap, ...style }}
      {...props}
    >
      <Logo
        pathClassName={logoClassName}
        style={{ width: size, height: size }}
      />
      <LogoText
        pathClassName={textClassName}
        style={{ height: textHeight, width: 'auto' }}
      />
    </div>
  );
};
