import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconSearchContentOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconSearchContentOutline18: React.FC<
  IconSearchContentOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="1.75"
        y1="14.75"
        x2="12.25"
        y2="14.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="1.75"
        y1="10.75"
        x2="5.25"
        y2="10.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="1.75"
        y1="6.75"
        x2="5.25"
        y2="6.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="1.75"
        y1="2.75"
        x2="12.25"
        y2="2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="11.25"
        cy="8.75"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="13.371"
        y1="10.871"
        x2="16.25"
        y2="13.75"
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
