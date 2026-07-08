import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSidebarLeftHideOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSidebarLeftHideOutline18: React.FC<
  IconSidebarLeftHideOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="6.25"
        y1="2.75"
        x2="6.25"
        y2="15.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <polyline
        points="12.25 6.5 9.75 9 12.25 11.5"
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
        transform="translate(18 18) rotate(180)"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
