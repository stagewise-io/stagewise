import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconLocation2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconLocation2Outline18: React.FC<IconLocation2Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <circle
        cx="9"
        cy="5"
        r="3.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <line
        x1="9"
        y1="13.25"
        x2="9"
        y2="8.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M12,12.429c2.507,.315,4.25,1.012,4.25,1.821,0,1.105-3.246,2-7.25,2s-7.25-.895-7.25-2c0-.809,1.743-1.507,4.25-1.821"
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
