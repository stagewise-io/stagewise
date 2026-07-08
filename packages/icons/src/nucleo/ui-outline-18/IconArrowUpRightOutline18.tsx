import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconArrowUpRightOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconArrowUpRightOutline18: React.FC<
  IconArrowUpRightOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="14.25"
        y1="3.75"
        x2="3.75"
        y2="14.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <polyline
        points="8.24 3.75 14.25 3.75 14.25 9.76"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
