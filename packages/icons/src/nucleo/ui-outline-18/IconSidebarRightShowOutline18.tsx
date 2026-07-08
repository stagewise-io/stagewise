import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSidebarRightShowOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSidebarRightShowOutline18: React.FC<
  IconSidebarRightShowOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="11.75"
        y1="2.75"
        x2="11.75"
        y2="15.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <polyline
        points="7.75 6.5 5.25 9 7.75 11.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <rect
        x="1.75"
        y="2.75"
        width="14.5"
        height="12.5"
        rx="2"
        ry="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
