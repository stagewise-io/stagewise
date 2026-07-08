import React from 'react';
import { Icon, type IconProps } from './Icon';
export const IconMediaStopFill18: React.FC<IconProps> = ({ ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <rect
        x="2"
        y="2"
        width="14"
        height="14"
        rx="2.75"
        ry="2.75"
        fill="currentColor"
      />
    </Icon>
  );
};
