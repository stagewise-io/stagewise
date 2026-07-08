import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSquareCodeOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSquareCodeOutline18: React.FC<
  IconSquareCodeOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M14 6.25L16.25 4L14 1.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M6.0225 2.75H4.75C3.645 2.75 2.75 3.646 2.75 4.75V13.25C2.75 14.354 3.645 15.25 4.75 15.25H13.25C14.355 15.25 15.25 14.354 15.25 13.25V8.97748"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11 6.25L8.75 4L11 1.75"
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
