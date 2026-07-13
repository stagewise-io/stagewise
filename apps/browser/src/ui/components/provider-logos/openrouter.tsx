import type { SVGProps } from 'react';

/**
 * OpenRouter brand mark — a stylized hexagon with a center node,
 * representing the routing/mesh nature of the service.
 *
 * Uses `currentColor` so it inherits the nearest `color` / `text-*` class.
 */
export function OpenRouterLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="OpenRouter"
      {...props}
    >
      <path d="M12 3.5 L20 8 L20 16 L12 20.5 L4 16 L4 8 Z" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 9.5 L12 3.5" />
      <path d="M12 14.5 L12 20.5" />
      <path d="M14.2 12.8 L19 15.5" opacity="0.5" />
      <path d="M9.8 12.8 L5 15.5" opacity="0.5" />
      <path d="M14.2 11.2 L19 8.5" opacity="0.5" />
      <path d="M9.8 11.2 L5 8.5" opacity="0.5" />
    </svg>
  );
}
