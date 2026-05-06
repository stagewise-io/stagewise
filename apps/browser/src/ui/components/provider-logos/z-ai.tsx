import type { SVGProps } from 'react';

/**
 * Z.ai brand mark.
 *
 * Sourced from @lobehub/icons-static-svg (MIT). Uses `currentColor` so it
 * inherits the nearest `color` / `text-*` class.
 */
export function ZAiLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Z.ai"
      {...props}
    >
      <path d="M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z" />
    </svg>
  );
}
