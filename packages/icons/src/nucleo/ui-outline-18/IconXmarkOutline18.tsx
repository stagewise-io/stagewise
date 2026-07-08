import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconXmarkOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconXmarkOutline18: React.FC<IconXmarkOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="14"
        y1="4"
        x2="4"
        y2="14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="4"
        y1="4"
        x2="14"
        y2="14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
