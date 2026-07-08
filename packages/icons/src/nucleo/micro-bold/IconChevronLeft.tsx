import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconChevronLeft: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <polyline
        points="12.5 3.5 6 10 12.5 16.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
};
