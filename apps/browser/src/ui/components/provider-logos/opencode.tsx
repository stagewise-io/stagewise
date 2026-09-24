import type { SVGProps } from 'react';

/**
 * OpenCode brand mark.
 *
 * Sourced from @lobehub/icons-static-svg (MIT). Uses `currentColor` so it
 * inherits the nearest `color` / `text-*` class.
 */
export function OpenCodeLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="OpenCode"
      {...props}
    >
      <path d="M16 6H8v12h8V6zm4 16H4V2h16v20z" />
    </svg>
  );
}
