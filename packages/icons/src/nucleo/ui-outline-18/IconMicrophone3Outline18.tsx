import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconMicrophone3Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconMicrophone3Outline18: React.FC<
  IconMicrophone3Outline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M15.25 7.5C15.25 10.946 12.446 13.75 9 13.75C5.554 13.75 2.75 10.946 2.75 7.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M12.25 4C12.25 2.2051 10.795 0.75 9 0.75C7.205 0.75 5.75 2.2051 5.75 4V7.5C5.75 9.2949 7.205 10.75 9 10.75C10.795 10.75 12.25 9.2949 12.25 7.5V4Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9 13.75V17.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M9.75 5.75H12.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.75 17.25H12.25"
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
