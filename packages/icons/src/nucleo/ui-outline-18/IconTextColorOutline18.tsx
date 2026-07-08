import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconTextColorOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconTextColorOutline18: React.FC<IconTextColorOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="12.57 10.25 9.273 1.75 8.727 1.75 5.43 10.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="6.4"
        y1="7.75"
        x2="11.6"
        y2="7.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <rect
        x="1.75"
        y="12.75"
        width="14.5"
        height="3.5"
        rx="1"
        ry="1"
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
