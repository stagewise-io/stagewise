import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconChevronDownOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconChevronDownOutline18: React.FC<
  IconChevronDownOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="15.25 6.5 9 12.75 2.75 6.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
