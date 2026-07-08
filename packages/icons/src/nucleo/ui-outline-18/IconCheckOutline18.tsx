import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCheckOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCheckOutline18: React.FC<IconCheckOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="2.75 9.25 6.75 14.25 15.25 3.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
