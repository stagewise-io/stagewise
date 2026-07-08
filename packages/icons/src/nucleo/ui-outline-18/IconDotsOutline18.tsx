import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconDotsOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconDotsOutline18: React.FC<IconDotsOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <circle
        cx="9"
        cy="9"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="3.25"
        cy="9"
        r=".5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        fill="currentColor"
      />
      <circle
        cx="14.75"
        cy="9"
        r=".5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        fill="currentColor"
      />
    </Icon>
  );
};
