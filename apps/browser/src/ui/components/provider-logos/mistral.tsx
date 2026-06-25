import type { SVGProps } from 'react';

/**
 * Mistral brand mark — official logo sourced from @lobehub/icons-static-svg (MIT).
 *
 * Uses `currentColor` so it inherits the nearest `color` / `text-*` class.
 */
export function MistralLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mistral"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M3.428 3.4h3.429v3.428h3.429v3.429h-.002 3.431V6.828h3.427V3.4h3.43v13.714H24v3.429H13.714v-3.428h-3.428v-3.429h-3.43v3.428h3.43v3.429H0v-3.429h3.428V3.4zm10.286 13.715h3.428v-3.429h-3.427v3.429z"
      />
    </svg>
  );
}
