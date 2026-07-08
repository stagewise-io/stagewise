import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconLoader6Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconLoader6Outline18: React.FC<IconLoader6Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="m9,1.75c4.0041,0,7.25,3.2459,7.25,7.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
