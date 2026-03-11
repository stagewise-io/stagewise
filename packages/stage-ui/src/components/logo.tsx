import type { FC, SVGAttributes } from 'react';
import { cn } from '../lib/utils';

export interface LogoProps extends SVGAttributes<SVGSVGElement> {
  /** className applied to the inner SVG paths */
  pathClassName?: string;
}

export const Logo: FC<LogoProps> = ({ className, pathClassName, ...props }) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-full', className)}
      aria-hidden="true"
      {...props}
    >
      <path
        className={cn(
          'fill-current text-primary-solid dark:text-primary-400',
          pathClassName,
        )}
        d="M50 0C77.6142 0 100 22.3858 100 50V90C100 95.5228 95.5228 100 90 100H50C22.3858 100 0 77.6142 0 50C0 22.3858 22.3858 0 50 0ZM50.1367 12C29.15 12.0002 12.1367 29.0133 12.1367 50C12.1367 70.9867 29.15 87.9998 50.1367 88C71.1235 88 88.1367 70.9868 88.1367 50C88.1367 29.0132 71.1235 12 50.1367 12Z"
      />
      <circle
        className={cn(
          'fill-current text-primary-solid dark:text-primary-400',
          pathClassName,
        )}
        cx="50"
        cy="50"
        r="28"
      />
    </svg>
  );
};
