import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconChevronReduceYOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconChevronReduceYOutline18: React.FC<
  IconChevronReduceYOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="5.5 3.5 9 7 12.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="5.5 14.5 9 11 12.5 14.5"
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
