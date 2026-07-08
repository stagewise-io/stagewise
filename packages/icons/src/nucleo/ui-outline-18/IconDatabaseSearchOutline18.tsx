import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconDatabaseSearchOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconDatabaseSearchOutline18: React.FC<
  IconDatabaseSearchOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M9 6.5C12.4518 6.5 15.25 5.493 15.25 4.25C15.25 3.007 12.4518 2 9 2C5.5482 2 2.75 3.007 2.75 4.25C2.75 5.493 5.5482 6.5 9 6.5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.25 8.5499V4.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M2.75 4.25V13.75C2.75 14.9791 5.4857 15.9774 8.8843 15.9996"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M2.75 9C2.75 10.2138 5.4181 11.2026 8.7578 11.2483"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M13.5 15.75C14.7426 15.75 15.75 14.743 15.75 13.5C15.75 12.257 14.7426 11.25 13.5 11.25C12.2574 11.25 11.25 12.257 11.25 13.5C11.25 14.743 12.2574 15.75 13.5 15.75Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M15.09 15.09L16.75 16.75"
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
