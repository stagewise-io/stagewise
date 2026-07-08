import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCodeCommitOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCodeCommitOutline18: React.FC<
  IconCodeCommitOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="1"
        y1="9"
        x2="5.75"
        y2="9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="17"
        y1="9"
        x2="12.25"
        y2="9"
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
