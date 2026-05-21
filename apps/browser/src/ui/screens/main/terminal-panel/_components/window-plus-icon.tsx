import type { SVGProps } from 'react';

export function WindowPlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      height="18"
      width="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.75 12.25L8.25 9.75L5.75 7.25" />
        <path d="M9.75 12.25H12.25" />
        <path d="M8.5 2.75H4.75C3.645 2.75 2.75 3.645 2.75 4.75V13.25C2.75 14.355 3.645 15.25 4.75 15.25H13.25C14.355 15.25 15.25 14.355 15.25 13.25V9.5" />
        <path d="M14 1.5V6.5" />
        <path d="M16.5 4H11.5" />
      </g>
    </svg>
  );
}
