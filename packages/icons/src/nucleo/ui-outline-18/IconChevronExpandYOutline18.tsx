import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconChevronExpandYOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconChevronExpandYOutline18: React.FC<
  IconChevronExpandYOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="12.5 6.25 9 2.75 5.5 6.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="12.5 11.75 9 15.25 5.5 11.75"
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
