import type { SVGProps } from 'react';

export function GlobePlusIcon({
  fill = 'currentColor',
  secondaryfill,
  ...props
}: SVGProps<SVGSVGElement> & { secondaryfill?: string }) {
  const sFill = secondaryfill || fill;
  return (
    <svg
      height="18"
      width="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g fill="none" stroke={fill} strokeWidth="1.5" strokeLinecap="round">
        {/* earth outline */}
        <path d="M16.2392 9.3991C16.2464 9.267 16.25 9.1339 16.25 9C16.25 4.9959 13.0041 1.75 9 1.75C4.9959 1.75 1.75 4.9959 1.75 9C1.75 13.0041 4.9959 16.25 9 16.25C9.1307 16.25 9.2606 16.2465 9.3897 16.2397" />
        {/* continents */}
        <path d="M13.0008 2.98069L11.4893 2.9094C10.4948 2.8625 9.73551 3.7861 9.97371 4.7527L10.2457 5.8562C10.3051 6.0973 10.2086 6.3499 10.0036 6.4899C9.83801 6.603 9.62661 6.6251 9.44121 6.5487L8.51411 6.1666C7.78921 5.8678 6.96161 5.9623 6.32271 6.4169C5.75691 6.8194 5.40531 7.4578 5.36751 8.1511L5.29651 9.4532" />
        <path d="M2.59167 5.7457C3.02037 6.8697 3.97027 8.6883 5.49667 9.6832C5.92257 9.9178 6.90037 10.6811 6.83237 11.8894C6.73917 13.5436 7.49188 13.4869 8.29058 14.0813C8.70068 14.3865 8.80518 15.3243 8.74518 16.0644" />
        <path d="M5.75409 9.8474C6.41499 9.7081 7.1658 9.4986 7.9978 9.6495" />
        {/* plus sign */}
        <line
          stroke={sFill}
          strokeLinecap="round"
          strokeLinejoin="round"
          x1="14.25"
          x2="14.25"
          y1="11.75"
          y2="16.75"
        />
        <line
          stroke={sFill}
          strokeLinecap="round"
          strokeLinejoin="round"
          x1="16.75"
          x2="11.75"
          y1="14.25"
          y2="14.25"
        />
      </g>
    </svg>
  );
}
