import { useId, type SVGProps } from 'react';

/**
 * Google brand mark.
 *
 * Uses the same four-color mark as the console login screen.
 */
export function GoogleLogo(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  const pathId = `${id}-google-g`;
  const clipId = `${id}-google-g-clip`;

  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Google"
      {...props}
    >
      <defs>
        <path
          id={pathId}
          d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
        />
      </defs>
      <clipPath id={clipId}>
        <use href={`#${pathId}`} overflow="visible" />
      </clipPath>
      <path clipPath={`url(#${clipId})`} fill="#FBBC05" d="M0 37V11l17 13z" />
      <path
        clipPath={`url(#${clipId})`}
        fill="#EA4335"
        d="M0 11l17 13 7-6.1L48 14V0H0z"
      />
      <path
        clipPath={`url(#${clipId})`}
        fill="#34A853"
        d="M0 37l30-23 7.9 1L48 0v48H0z"
      />
      <path
        clipPath={`url(#${clipId})`}
        fill="#4285F4"
        d="M48 48L17 24l-4-3 35-10z"
      />
    </svg>
  );
}
