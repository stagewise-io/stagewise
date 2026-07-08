import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconBrainOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconBrainOutline18: React.FC<IconBrainOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M9 4.5C9 3.257 10.007 2.25 11.25 2.25C12.493 2.25 13.5 3.257 13.5 4.5C13.5 4.593 13.484 4.682 13.473 4.772C14.748 4.886 15.75 5.945 15.75 7.25C15.75 8.27 15.137 9.145 14.261 9.533C14.85 9.881 15.25 10.516 15.25 11.25C15.25 12.278 14.471 13.115 13.473 13.228C13.484 13.318 13.5 13.407 13.5 13.5C13.5 14.743 12.493 15.75 11.25 15.75C10.007 15.75 9 14.743 9 13.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M5.49998 9.75H4.74998C4.38898 9.75 4.04499 9.673 3.73499 9.536"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14.265 9.536C13.955 9.673 13.611 9.75 13.25 9.75H12.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M9 4.5C9 3.257 7.993 2.25 6.75 2.25C5.507 2.25 4.5 3.257 4.5 4.5C4.5 4.593 4.51599 4.682 4.52699 4.772C3.25199 4.886 2.25 5.945 2.25 7.25C2.25 8.27 2.863 9.145 3.739 9.533C3.15 9.881 2.75 10.516 2.75 11.25C2.75 12.278 3.52899 13.115 4.52699 13.228C4.51599 13.318 4.5 13.407 4.5 13.5C4.5 14.743 5.507 15.75 6.75 15.75C7.993 15.75 9 14.743 9 13.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9 13.5V4.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
