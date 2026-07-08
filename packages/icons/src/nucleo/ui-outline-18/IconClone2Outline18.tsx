import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconClone2Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconClone2Outline18: React.FC<IconClone2Outline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M5.75 12.25H4.25C3.1454 12.25 2.25 11.3546 2.25 10.25V4.25C2.25 3.1454 3.1454 2.25 4.25 2.25H10.25C11.3546 2.25 12.25 3.1454 12.25 4.25V5.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M13.75 5.75H7.75C6.64543 5.75 5.75 6.64543 5.75 7.75V13.75C5.75 14.8546 6.64543 15.75 7.75 15.75H13.75C14.8546 15.75 15.75 14.8546 15.75 13.75V7.75C15.75 6.64543 14.8546 5.75 13.75 5.75Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
