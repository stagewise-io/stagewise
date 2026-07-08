import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconChevronLeftOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconChevronLeftOutline18: React.FC<
  IconChevronLeftOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="11.5 15.25 5.25 9 11.5 2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
