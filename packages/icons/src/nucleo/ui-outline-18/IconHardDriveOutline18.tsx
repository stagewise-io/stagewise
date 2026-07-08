import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconHardDriveOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconHardDriveOutline18: React.FC<IconHardDriveOutline18Props> = ({
  strokeWidth = 1.5,
  ...props
}) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M14.25 8.75H3.75C2.6454 8.75 1.75 9.6454 1.75 10.75V12.75C1.75 13.8546 2.6454 14.75 3.75 14.75H14.25C15.3546 14.75 16.25 13.8546 16.25 12.75V10.75C16.25 9.6454 15.3546 8.75 14.25 8.75Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M1.84106 10.1538L4.02496 4.0739C4.31026 3.2797 5.06336 2.75 5.90726 2.75H12.093C12.9369 2.75 13.6901 3.2797 13.9754 4.0739L16.1593 10.1538"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M4.75 11.75H7.5"
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
