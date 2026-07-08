import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconTextBgColorOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconTextBgColorOutline18: React.FC<
  IconTextBgColorOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <rect
        x="2.75"
        y="2.75"
        width="12.5"
        height="12.5"
        rx="2"
        ry="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="11.798 12.25 9.068 5.75 8.932 5.75 6.202 12.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="6.832"
        y1="10.75"
        x2="11.168"
        y2="10.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
    </Icon>
  );
};
