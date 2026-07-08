import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconArrowRightOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconArrowRightOutline18: React.FC<
  IconArrowRightOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="15.25"
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
      <polyline
        points="11 4.75 15.25 9 11 13.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
