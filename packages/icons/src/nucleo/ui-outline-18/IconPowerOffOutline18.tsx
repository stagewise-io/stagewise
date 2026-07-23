import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconPowerOffOutline18Props extends IconProps {
  strokeWidth?: number;
}

export const IconPowerOffOutline18: React.FC<IconPowerOffOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M5.5,3.236c-1.946,1.184-3.25,3.319-3.25,5.764,0,3.728,3.022,6.75,6.75,6.75s6.75-3.022,6.75-6.75c0-2.445-1.304-4.579-3.25-5.764"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="9"
        y1="1.75"
        x2="9"
        y2="8.25"
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
