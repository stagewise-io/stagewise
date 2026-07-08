import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconColorPaletteOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconColorPaletteOutline18: React.FC<
  IconColorPaletteOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M7.25 3.75C7.25 3.198 6.802 2.75 6.25 2.75H3.75C3.198 2.75 2.75 3.198 2.75 3.75V13"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M13.132 8.04999C13.523 7.65899 13.523 7.02599 13.132 6.63599L11.364 4.86802C10.973 4.47702 10.34 4.47702 9.95001 4.86802L3.409 11.409"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      />
      <path
        d="M2.75 13C2.75 11.758 3.758 10.75 5 10.75H14.25C14.802 10.75 15.25 11.198 15.25 11.75V14.25C15.25 14.802 14.802 15.25 14.25 15.25H5C3.758 15.25 2.75 14.242 2.75 13Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7.25 10.75V15.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11.25 10.75V15.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Icon>
  );
};
