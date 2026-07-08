import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconXmark: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="20px" {...props}>
      <line
        x1="5"
        y1="5"
        x2="15"
        y2="15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        data-color="color-2"
      />
      <line
        x1="5"
        y1="15"
        x2="15"
        y2="5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
};
