import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconGlobe3Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconGlobe3Outline18: React.FC<IconGlobe3Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <ellipse
        cx="9"
        cy="9"
        rx="3"
        ry="7.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="2.106"
        y1="6.75"
        x2="15.894"
        y2="6.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="2.29"
        y1="11.75"
        x2="15.71"
        y2="11.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="9"
        cy="9"
        r="7.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
