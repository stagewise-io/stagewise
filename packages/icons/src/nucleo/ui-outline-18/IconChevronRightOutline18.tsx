import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconChevronRightOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconChevronRightOutline18: React.FC<
  IconChevronRightOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="6.5 2.75 12.75 9 6.5 15.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
