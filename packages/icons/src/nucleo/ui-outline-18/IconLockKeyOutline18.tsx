import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconLockKeyOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconLockKeyOutline18: React.FC<IconLockKeyOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M5.25 8.25V5C5.25 3.205 6.705 1.75 8.5 1.75C10.295 1.75 11.75 3.205 11.75 5V8.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11 16.75C12.1046 16.75 13 15.8546 13 14.75C13 13.6454 12.1046 12.75 11 12.75C9.89543 12.75 9 13.6454 9 14.75C9 15.8546 9.89543 16.75 11 16.75Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M13 14.75H17"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M14.25 10.9785V10.25C14.25 9.145 13.355 8.25 12.25 8.25H4.75C3.645 8.25 2.75 9.145 2.75 10.25V14.25C2.75 15.355 3.645 16.25 4.75 16.25H6.25529"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.5 14.75V16.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
    </Icon>
  );
};
