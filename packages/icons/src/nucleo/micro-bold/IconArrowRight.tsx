import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconArrowRight: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <line
        x1="3"
        y1="10"
        x2="17"
        y2="10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        data-color="color-2"
      />
      <polyline
        points="12 15 17 10 12 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
};
