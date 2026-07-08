import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconRefreshAnticlockwiseOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconRefreshAnticlockwiseOutline18: React.FC<
  IconRefreshAnticlockwiseOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M16.2472 8.79578C16.1391 4.88618 12.9357 1.75 8.99998 1.75C5.98368 1.75 3.39809 3.59197 2.30579 6.21167"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M1.88 3.30505L2.28799 6.25L5.23199 5.84302"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M1.75281 9.20276C1.86021 13.1131 5.0638 16.25 9 16.25C12.0051 16.25 14.5826 14.4216 15.6819 11.8175"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M16.12 14.6949L15.712 11.75L12.768 12.157"
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
