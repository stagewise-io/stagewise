import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconKey2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconKey2Outline18: React.FC<IconKey2Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="8.296"
        y1="9.704"
        x2="15.25"
        y2="2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="14"
        y1="4"
        x2="16"
        y2="6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="12"
        y1="6"
        x2="14"
        y2="8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="6"
        cy="12"
        r="3.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
