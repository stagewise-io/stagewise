import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconGripDotsVerticalOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconGripDotsVerticalOutline18: React.FC<
  IconGripDotsVerticalOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <circle
        cx="6.75"
        cy="9"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="6.75"
        cy="3.75"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="6.75"
        cy="14.25"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="11.25"
        cy="9"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="11.25"
        cy="3.75"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="11.25"
        cy="14.25"
        r=".5"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
