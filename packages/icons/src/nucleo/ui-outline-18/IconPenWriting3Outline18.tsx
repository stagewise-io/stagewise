import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconPenWriting3Outline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconPenWriting3Outline18: React.FC<
  IconPenWriting3Outline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M2.75 15.25C2.75 15.25 6.34901 14.682 7.29601 13.735C8.24301 12.788 14.623 6.40798 14.623 6.40798C15.46 5.57098 15.46 4.214 14.623 3.377C13.786 2.541 12.429 2.541 11.593 3.377C11.593 3.377 5.21301 9.757 4.26601 10.704C3.31901 11.651 2.75 15.25 2.75 15.25Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.5 14.68C14.741 15.439 13.509 15.439 12.75 14.68C11.991 13.921 10.759 13.921 10 14.68"
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
