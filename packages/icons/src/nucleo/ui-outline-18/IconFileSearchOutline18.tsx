import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconFileSearchOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconFileSearchOutline18: React.FC<
  IconFileSearchOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M5.75 6.75H7.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.75 9.75H10.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.16 6.25H11.75C11.198 6.25 10.75 5.802 10.75 5.25V1.85201"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14 16.25C15.243 16.25 16.25 15.243 16.25 14C16.25 12.757 15.243 11.75 14 11.75C12.757 11.75 11.75 12.757 11.75 14C11.75 15.243 12.757 16.25 14 16.25Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M15.25 8.91701V6.66409C15.25 6.39899 15.145 6.14411 14.957 5.95711L11.043 2.043C10.855 1.855 10.601 1.75 10.336 1.75H4.75C3.645 1.75 2.75 2.646 2.75 3.75V14.25C2.75 15.354 3.645 16.25 4.75 16.25H9.2766"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
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
    </Icon>
  );
};
