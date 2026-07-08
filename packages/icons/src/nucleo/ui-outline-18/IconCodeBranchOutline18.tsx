import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCodeBranchOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCodeBranchOutline18: React.FC<
  IconCodeBranchOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="4.75"
        y1="5.75"
        x2="4.75"
        y2="12.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M13.25,5.75v1c0,1.105-.895,2-2,2H6.75c-1.105,0-2,.895-2,2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="4.75"
        cy="3.75"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="13.25"
        cy="3.75"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="4.75"
        cy="14.25"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
