import React from 'react';
import { Icon, type IconProps } from './Icon';

interface IconFloppyDiskOutline18Props extends IconProps {
  strokeWidth?: number;
}
export const IconFloppyDiskOutline18: React.FC<
  IconFloppyDiskOutline18Props
> = ({ strokeWidth = 1.5, ...props }) => {
  return (
    <Icon size="18px" {...props}>
      <path
        d="M10.75,2.25v3c0,.552-.448,1-1,1h-3.5c-.552,0-1-.448-1-1V2.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M5.25,15.75v-5c0-.552,.448-1,1-1h5.5c.552,0,1,.448,1,1v5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      />
      <path
        d="M13.59,15.75H4.41c-1.193,0-2.16-.967-2.16-2.16V4.41c0-1.193,.967-2.16,2.16-2.16h7.426c.265,0,.52,.105,.707,.293l2.914,2.914c.188,.188,.293,.442,.293,.707v7.426c0,1.193-.967,2.16-2.16,2.16Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Icon>
  );
};
