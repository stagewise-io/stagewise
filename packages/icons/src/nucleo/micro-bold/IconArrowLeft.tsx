import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconArrowLeft: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <line
        x1="17"
        y1="10"
        x2="3"
        y2="10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        data-color="color-2"
      />
      <polyline
        points="8 5 3 10 8 15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
};
