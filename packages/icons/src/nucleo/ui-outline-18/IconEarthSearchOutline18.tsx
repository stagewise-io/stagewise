import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconEarthSearchOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconEarthSearchOutline18: React.FC<
  IconEarthSearchOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M14 16.25C15.243 16.25 16.25 15.2426 16.25 14C16.25 12.7574 15.243 11.75 14 11.75C12.757 11.75 11.75 12.7574 11.75 14C11.75 15.2426 12.757 16.25 14 16.25Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M15.59 15.59L17.25 17.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M13.0008 2.98069L11.4893 2.9094C10.4948 2.8625 9.73549 3.7861 9.97369 4.7527L10.2457 5.8562C10.3051 6.0973 10.2086 6.3499 10.0036 6.4899C9.838 6.603 9.62659 6.6251 9.44119 6.5487L8.5141 6.1666C7.7892 5.8678 6.96159 5.9623 6.32269 6.4169C5.75689 6.8194 5.40529 7.4578 5.36749 8.1511L5.29651 9.4532"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M2.59167 5.7457C3.02027 6.8697 3.97028 8.6883 5.49658 9.6832C5.92248 9.9178 6.90028 10.6811 6.83228 11.8894C6.73908 13.5436 7.35876 13.633 8.15756 14.2274C8.56766 14.5326 8.67218 15.4704 8.61218 16.2104"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M5.75421 9.8474C6.88271 9.6094 8.2737 9.1671 9.8829 10.6637"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M8.60159 16.2392C4.78289 16.0324 1.75 12.8703 1.75 9C1.75 4.996 4.996 1.75 9 1.75C13.004 1.75 16.25 4.996 16.25 9C16.25 9.0854 16.2485 9.1705 16.2455 9.2553"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
