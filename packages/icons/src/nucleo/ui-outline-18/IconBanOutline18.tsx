import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBanOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBanOutline18: React.FC<IconBanOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="3.873"
        y1="14.127"
        x2="14.118"
        y2="3.882"
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
        r="7.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
