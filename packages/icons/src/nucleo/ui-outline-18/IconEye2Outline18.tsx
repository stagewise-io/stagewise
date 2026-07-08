import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconEye2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconEye2Outline18: React.FC<IconEye2Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <circle
        cx="9"
        cy="9"
        r="2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M1.75,9S3.521,3.5,9,3.5s7.25,5.5,7.25,5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
