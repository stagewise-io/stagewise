import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconVersionsOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconVersionsOutline18: React.FC<IconVersionsOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M4.813,12.75h-1.063c-1.105,0-2-.895-2-2v-3.5c0-1.105,.895-2,2-2h1.064"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M8.314,14.25h-1.564c-1.105,0-2-.895-2-2V5.75c0-1.105,.895-2,2-2h1.564"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <rect
        x="8.25"
        y="2.25"
        width="7.5"
        height="13.5"
        rx="2"
        ry="2"
        transform="translate(24 18) rotate(180)"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
