import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconConnection2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconConnection2Outline18: React.FC<
  IconConnection2Outline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m5.75,5.25h1.25c1.1046,0,2,.8954,2,2v3.25c0,1.1046.8954,2,2,2h1.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <circle
        cx="3.75"
        cy="5.25"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="14.25"
        cy="12.75"
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
