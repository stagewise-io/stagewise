import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconCopyOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconCopyOutline18: React.FC<IconCopyOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M2.25 6.75V13.25C2.25 14.355 3.145 15.25 4.25 15.25H11.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M7.25 12.25H13.75C14.8546 12.25 15.75 11.355 15.75 10.25V4.75C15.75 3.645 14.8546 2.75 13.75 2.75H7.25C6.1454 2.75 5.25 3.645 5.25 4.75V10.25C5.25 11.355 6.1454 12.25 7.25 12.25Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
