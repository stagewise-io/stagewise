import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconChevronRight: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <polyline
        points="7.5 16.5 14 10 7.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
};
