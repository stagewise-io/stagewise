import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconArrowsOppositeDirectionXOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconArrowsOppositeDirectionXOutline18: React.FC<
  IconArrowsOppositeDirectionXOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="5.5 9.5 2.25 6.25 5.5 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="2.25"
        y1="6.25"
        x2="10.25"
        y2="6.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polyline
        points="12.5 15 15.75 11.75 12.5 8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="15.75"
        y1="11.75"
        x2="7.75"
        y2="11.75"
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
