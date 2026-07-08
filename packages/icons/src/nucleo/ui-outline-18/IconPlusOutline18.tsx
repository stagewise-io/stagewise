import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconPlusOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconPlusOutline18: React.FC<IconPlusOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <line
        x1="9"
        y1="3.25"
        x2="9"
        y2="14.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <line
        x1="3.25"
        y1="9"
        x2="14.75"
        y2="9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
