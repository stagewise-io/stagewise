import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconTextAlignLeft2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconTextAlignLeft2Outline18: React.FC<
  IconTextAlignLeft2Outline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="2.75"
        y1="10.75"
        x2="15.25"
        y2="10.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="2.75"
        y1="14.25"
        x2="9.25"
        y2="14.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="2.75"
        y1="7.25"
        x2="9.25"
        y2="7.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="2.75"
        y1="3.75"
        x2="15.25"
        y2="3.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
