import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCheck2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCheck2Outline18: React.FC<IconCheck2Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <polyline
        points="2.75 9.5 6.5 13.25 15.25 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
