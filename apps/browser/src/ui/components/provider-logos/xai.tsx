import type { SVGProps } from 'react';

/**
 * xAI brand mark — simplified bold X logo.
 *
 * Uses `currentColor` so it inherits the nearest `color` / `text-*` class.
 */
export function XaiLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="xAI"
      {...props}
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
