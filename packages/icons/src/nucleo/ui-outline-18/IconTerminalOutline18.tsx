import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconTerminalOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconTerminalOutline18: React.FC<IconTerminalOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="2.75 14.25 8 9 2.75 3.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="9.5"
        y1="14.25"
        x2="15.25"
        y2="14.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
    </Icon>
  );
};
