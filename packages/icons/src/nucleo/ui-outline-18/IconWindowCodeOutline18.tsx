import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconWindowCodeOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconWindowCodeOutline18: React.FC<
  IconWindowCodeOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <rect
        x="1.75"
        y="2.75"
        width="14.5"
        height="12.5"
        rx="2"
        ry="2"
        transform="translate(18 18) rotate(180)"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle
        cx="4.25"
        cy="5.25"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <circle
        cx="6.75"
        cy="5.25"
        r=".75"
        fill="currentColor"
        data-color="color-2"
        data-stroke="none"
      />
      <polyline
        points="10.75 12.25 13 10 10.75 7.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <polyline
        points="7.25 12.25 5 10 7.25 7.75"
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
