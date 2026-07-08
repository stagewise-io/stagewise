import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconOpenRectArrowInOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconOpenRectArrowInOutline18: React.FC<
  IconOpenRectArrowInOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M9.75,2.75h3.5c1.105,0,2,.895,2,2V13.25c0,1.105-.895,2-2,2h-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="6.75 12.5 10.25 9 6.75 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="10.25"
        y1="9"
        x2="2.75"
        y2="9"
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
