import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconOpenExternalOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconOpenExternalOutline18: React.FC<
  IconOpenExternalOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m12.25,12.25v1.5c0,1.1046-.8954,2-2,2h-6c-1.1046,0-2-.8954-2-2v-6c0-1.1046.8954-2,2-2h1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="m5.75,4.25v6c0,1.1046.8954,2,2,2h6c1.1046,0,2-.8954,2-2v-6c0-1.1046-.8954-2-2-2h-6c-1.1046,0-2,.8954-2,2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="9.75 5.25 12.75 5.25 12.75 8.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="9"
        y1="9"
        x2="12.5"
        y2="5.5"
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
